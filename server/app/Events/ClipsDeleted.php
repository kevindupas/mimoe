<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Clips supprimés côté serveur (cap max atteint ou TTL expiré). Les clients
 * retirent ces ids de leur liste + cache -> plus de données périmées affichées.
 */
class ClipsDeleted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /** @param array<int, string> $ids */
    public function __construct(public int $userId, public array $ids)
    {
    }

    /** @return array<int, Channel> */
    public function broadcastOn(): array
    {
        return [new PrivateChannel('clips.'.$this->userId)];
    }

    public function broadcastAs(): string
    {
        return 'clips.deleted';
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        return ['ids' => $this->ids];
    }
}
