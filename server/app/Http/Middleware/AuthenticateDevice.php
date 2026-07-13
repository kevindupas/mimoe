<?php

namespace App\Http\Middleware;

use App\Models\Device;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateDevice
{
    /**
     * Auth par bearer token appareil. Le token n'est jamais stocke en clair :
     * on compare le sha256 au token_hash de la table devices.
     * Un appareil revoque (revoked_at != null) est refuse.
     *
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();

        if (! $token) {
            return response()->json(['message' => 'Missing device token.'], 401);
        }

        $device = Device::where('token_hash', hash('sha256', $token))
            ->whereNull('revoked_at')
            ->first();

        if (! $device) {
            return response()->json(['message' => 'Invalid or revoked device.'], 401);
        }

        // Dispo dans le controller via $request->attributes->get('device')
        $request->attributes->set('device', $device);
        // Permet a l'auth de canal Reverb (/broadcasting/auth) de reconnaitre l'appareil.
        $request->setUserResolver(fn () => $device);

        return $next($request);
    }
}
