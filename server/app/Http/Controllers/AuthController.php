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
     * Dummy bcrypt hash used to equalize login timing when the account does not exist.
     * It is not the hash of any real password (a fixed constant).
     */
    private const DUMMY_HASH = '$2y$12$lt8iqFerTNm7VoZqj.Stxur5QoMKtmvKcWnCfgmRmxZtAi23ZCsgu';

    /**
     * Instance capabilities, without authentication.
     *
     * The client queries it as soon as it knows the server URL, to hide account
     * creation on a closed instance. It reveals nothing sensitive: the
     * information is deducible anyway by calling /register.
     */
    public function serverInfo(): JsonResponse
    {
        return response()->json([
            'registration_enabled' => (bool) config('mimoe.registration_enabled', true),
        ]);
    }

    /** Registration: creates the account then connects the device. */
    public function register(Request $request): JsonResponse
    {
        // Private instance: registration closed (self-hosters keep the open default).
        if (! config('mimoe.registration_enabled', true)) {
            return response()->json(['message' => 'Registrations are closed on this server.'], 403);
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

    /** Login for an existing device. */
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

        // Constant time: we always run a Hash::check, even if the account does
        // not exist, against a dummy bcrypt hash. Otherwise an unknown email would
        // respond faster than a wrong password -> an oracle revealing accounts.
        $hash = $user?->password ?? self::DUMMY_HASH;
        $passwordOk = Hash::check($data['password'], $hash);

        if (! $user || ! $passwordOk) {
            throw ValidationException::withMessages(['email' => 'Invalid credentials.']);
        }

        return $this->issue($user, $data);
    }

    /** Registers the device, returns an API token + the account id (for the private channel). */
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

        // Reverb params for the CLIENTS, derived from APP_URL (robust behind a TLS proxy).
        $appUrl = (string) config('app.url');
        $scheme = str_starts_with($appUrl, 'https') ? 'https' : 'http';
        $host = parse_url($appUrl, PHP_URL_HOST) ?: request()->getHost();
        $port = (int) env('REVERB_CLIENT_PORT', $scheme === 'https' ? 443 : 8080);

        return response()->json([
            'token' => $token,
            'user_id' => $user->id,
            'email' => $user->email,
            'reverb_app_key' => config('reverb.apps.apps.0.key'),
            'reverb_host' => $host,
            'reverb_port' => $port,
            'reverb_scheme' => $scheme,
        ]);
    }

    /**
     * Right to erasure (GDPR): deletes the account and all its data.
     *
     * Clips, devices (along with their push tokens) and blobs disappear through
     * DB cascade (cascadeOnDelete on user_id). Sanctum tokens, however, do not
     * cascade — we revoke them explicitly.
     */
    /** Returns the authenticated account's email (for the settings screen). */
    public function me(Request $request): JsonResponse
    {
        return response()->json(['email' => $request->user()->email]);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->tokens()->delete();
        $user->delete();

        return response()->json(['message' => 'Account and data deleted.']);
    }
}
