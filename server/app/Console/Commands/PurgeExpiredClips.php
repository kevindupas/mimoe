<?php

namespace App\Console\Commands;

use App\Models\Clip;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('clipd:purge')]
#[Description('Purge les clips expires (TTL depasse).')]
class PurgeExpiredClips extends Command
{
    public function handle(): int
    {
        $clips = Clip::where('expires_at', '<=', now())->delete();
        $blobs = \App\Models\Blob::where('expires_at', '<=', now())->delete();

        $this->info("Purged {$clips} clip(s) and {$blobs} blob(s).");

        return self::SUCCESS;
    }
}
