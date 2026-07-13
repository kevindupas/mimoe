<?php

namespace App\Services;

use App\Models\Clip;
use App\Models\Device;
use Kreait\Firebase\Factory;
use Kreait\Firebase\Messaging\CloudMessage;
use Kreait\Firebase\Messaging\Notification;

/**
 * Push natif FCM (Android). Envoye quand un clip arrive : reveille les autres
 * appareils du compte MEME app tuee (le WebSocket ne peut rien quand le process
 * est mort). E2E : le push ne contient JAMAIS le contenu (le serveur n'a que du
 * ciphertext), juste un libelle generique + l'id du clip pour l'ouverture.
 */
class PushService
{
    /** Notifie tous les appareils du compte sauf celui qui a emis le clip. */
    public function notifyOtherDevices(Clip $clip): void
    {
        $credentials = env('FIREBASE_CREDENTIALS');
        if (! $credentials || ! is_file($credentials)) {
            return; // pas configure (dev / creds absentes) -> no-op silencieux
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
                'Nouveau presse-papier',
                $clip->kind === 'image' ? 'Image reçue' : 'Texte reçu',
            ))
            ->withData(['clipId' => $clip->id])
            ->withAndroidConfig([
                'priority' => 'high', // reveille l'appareil meme en Doze
                'notification' => ['channel_id' => 'clips'],
            ]);

        $report = $messaging->sendMulticast($message, $devices->pluck('push_token')->all());

        // Nettoie les tokens morts (app desinstallee / token expire).
        $stale = array_merge($report->invalidTokens(), $report->unknownTokens());
        if (! empty($stale)) {
            Device::whereIn('push_token', $stale)
                ->update(['push_token' => null, 'push_platform' => null]);
        }
    }
}
