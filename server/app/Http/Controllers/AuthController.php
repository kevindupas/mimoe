<?php

namespace App\Http\Controllers;

use App\Models\Device;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Inscription : crée le compte puis connecte l'appareil. */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'device_id' => ['required', 'uuid'],
            'device_name' => ['required', 'string'],
            'platform' => ['required', 'in:android,macos,windows,linux'],
        ]);

        $user = User::create([
            'name' => explode('@', $data['email'])[0],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        return $this->issue($user, $data);
    }

    /** Connexion d'un appareil existant. */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
            'device_id' => ['required', 'uuid'],
            'device_name' => ['required', 'string'],
            'platform' => ['required', 'in:android,macos,windows,linux'],
        ]);

        $user = User::where('email', $data['email'])->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Identifiants invalides.']);
        }

        return $this->issue($user, $data);
    }

    /** Enregistre l'appareil, renvoie un token API + l'id du compte (pour le canal privé). */
    private function issue(User $user, array $data): JsonResponse
    {
        Device::updateOrCreate(
            ['id' => $data['device_id']],
            [
                'user_id' => $user->id,
                'name' => $data['device_name'],
                'platform' => $data['platform'],
                'paired_at' => now(),
            ],
        );

        $token = $user->createToken($data['device_name'])->plainTextToken;

        return response()->json([
            'token' => $token,
            'user_id' => $user->id,
            // Reverb est co-localisé avec l'API : le client le joint sur le même hôte.
            'reverb_app_key' => config('reverb.apps.apps.0.key'),
            'reverb_host' => request()->getHost(),
            'reverb_port' => (int) env('REVERB_CLIENT_PORT', config('reverb.servers.reverb.port', 8080)),
            'reverb_scheme' => request()->secure() ? 'https' : 'http',
        ]);
    }
}
