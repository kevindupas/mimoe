<?php

namespace App\Events;

use App\Models\Clip;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ClipReceived implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Clip $clip)
    {
    }

    /**
     * Canal privé par utilisateur : seuls les appareils de ce compte l'écoutent.
     *
     * @return array<int, Channel>
     */
    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('clips.'.$this->clip->user_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'clip.received';
    }

    /**
     * Payload pousse = ciphertext + metadonnees. Aucun contenu en clair.
     * Les clients ignorent le message si origin_device_id == leur propre id.
     *
     * @return array<string, mixed>
     */
    public function broadcastWith(): array
    {
        return [
            'id' => $this->clip->id,
            'origin_device_id' => $this->clip->origin_device_id,
            'ciphertext' => $this->clip->ciphertext,
            'nonce' => $this->clip->nonce,
            'is_sensitive' => $this->clip->is_sensitive,
            'created_at' => $this->clip->created_at->toIso8601String(),
            'expires_at' => $this->clip->expires_at->toIso8601String(),
        ];
    }
}
