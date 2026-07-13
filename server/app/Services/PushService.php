<?php

namespace App\Services;

use App\Models\Clip;
use App\Models\Device;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

/**
 * Native FCM push (Android). Sent when a clip arrives: wakes up the account's
 * other devices EVEN when the app is killed (the WebSocket can do nothing when
 * the process is dead). E2E: the push NEVER contains the content (the server
 * only has ciphertext), just a generic label + the clip id for opening it.
 */
class PushService
{
    /** Notifies all the account's devices except the one that emitted the clip. */
    public function notifyOtherDevices(Clip $clip): void
    {
        $credentials = env('FIREBASE_CREDENTIALS');
        if (! $credentials || ! is_file($credentials)) {
            return; // not configured (dev / missing creds) -> silent no-op
        }

        $devices = Device::where('user_id', $clip->user_id)
            ->where('id', '!=', $clip->origin_device_id)
            ->whereNotNull('push_token')
            ->get(['id', 'push_token']);

        if ($devices->isEmpty()) {
            return;
        }

        $messaging = (new Factory)->withServiceAccount($credentials)->createMessaging();

        $message = CloudMessage::new()
            ->withNotification(Notification::create(
                'New clipboard',
                $clip->kind === 'image' ? 'Image received' : 'Text received',
            ))
            ->withData(['clipId' => $clip->id])
            ->withAndroidConfig([
                'priority' => 'high', // wakes the device even in Doze
                'notification' => ['channel_id' => 'clips'],
            ]);

        $report = $messaging->sendMulticast($message, $devices->pluck('push_token')->all());

        // Clean up dead tokens (app uninstalled / token expired).
        $stale = array_merge($report->invalidTokens(), $report->unknownTokens());
        if (! empty($stale)) {
            Device::whereIn('push_token', $stale)
                ->update(['push_token' => null, 'push_platform' => null]);
        }
    }
}
