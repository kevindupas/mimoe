<?php

namespace App\Http\Controllers;

use App\Models\Device;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PushController extends Controller
{
    /** Enregistre le token push natif (FCM) d'un appareil du compte. */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'device_id' => ['required', 'uuid'],
            'token' => ['required', 'string'],
            'platform' => ['sometimes', 'in:android,ios'],
        ]);

        $device = Device::where('id', $data['device_id'])
            ->where('user_id', $request->user()->id)
            ->first();

        if (! $device) {
            return response()->json(['message' => 'appareil inconnu'], 404);
        }

        $device->update([
            'push_token' => $data['token'],
            'push_platform' => $data['platform'] ?? 'android',
        ]);

        return response()->json(['ok' => true]);
    }
}
