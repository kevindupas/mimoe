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
    /**
     * Capacités de l'instance, sans authentification.
     *
     * Le client l'interroge dès qu'il connaît l'URL du serveur, pour masquer la
     * création de compte sur une instance fermée. Ne révèle rien de sensible :
     * l'information est de toute façon déductible en appelant /register.
     */
    public function serverInfo(): JsonResponse
    {
        return response()->json([
            'registration_enabled' => (bool) config('mimoe.registration_enabled', true),
        ]);
    }

    /** Inscription : crée le compte puis connecte l'appareil. */
    public function register(Request $request): JsonResponse
    {
        // Instance privée : inscription fermée (les self-hosters gardent le défaut ouvert).
        if (! config('mimoe.registration_enabled', true)) {
            return response()->json(['message' => 'Les inscriptions sont fermées sur ce serveur.'], 403);
        }

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

        // Params Reverb pour les CLIENTS, dérivés de APP_URL (robuste derrière un proxy TLS).
        $appUrl = (string) config('app.url');
        $scheme = str_starts_with($appUrl, 'https') ? 'https' : 'http';
        $host = parse_url($appUrl, PHP_URL_HOST) ?: request()->getHost();
        $port = (int) env('REVERB_CLIENT_PORT', $scheme === 'https' ? 443 : 8080);

        return response()->json([
            'token' => $token,
            'user_id' => $user->id,
            'reverb_app_key' => config('reverb.apps.apps.0.key'),
            'reverb_host' => $host,
            'reverb_port' => $port,
            'reverb_scheme' => $scheme,
        ]);
    }
}
