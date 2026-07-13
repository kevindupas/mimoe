<?php

namespace App\Console\Commands;

use App\Models\Clip;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('mimoe:purge')]
#[Description('Purge les clips expires (TTL depasse).')]
class PurgeExpiredClips extends Command
{
    public function handle(): int
    {
        // Fetch the expired ones (id + user) BEFORE deletion -> to notify the clients.
        $expired = Clip::where('expires_at', '<=', now())->get(['id', 'user_id']);

        $clips = Clip::where('expires_at', '<=', now())->delete();
        $blobs = \App\Models\Blob::where('expires_at', '<=', now())->delete();

        // Broadcast per user: clients remove these ids live.
        foreach ($expired->groupBy('user_id') as $userId => $rows) {
            broadcast(new \App\Events\ClipsDeleted((int) $userId, $rows->pluck('id')->all()));
        }

        $this->info("Purged {$clips} clip(s) and {$blobs} blob(s).");

        return self::SUCCESS;
    }
}
