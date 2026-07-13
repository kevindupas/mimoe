<?php

namespace App\Console\Commands;

use App\Models\Device;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

#[Signature('clipd:pair {name} {platform : android|macos}')]
#[Description('Appaire un appareil : cree le device et affiche son token (une seule fois).')]
class PairDevice extends Command
{
    public function handle(): int
    {
        $platform = $this->argument('platform');

        if (! in_array($platform, ['android', 'macos'], true)) {
            $this->error('platform doit etre "android" ou "macos".');

            return self::FAILURE;
        }

        // Token clair genere ici, jamais stocke : seul le sha256 va en base.
        $token = Str::random(48);

        $device = Device::create([
            'id' => (string) Str::uuid(),
            'name' => $this->argument('name'),
            'platform' => $platform,
            'token_hash' => hash('sha256', $token),
            'paired_at' => now(),
        ]);

        $this->info('Appareil appaire.');
        $this->newLine();
        $this->line("  device_id : {$device->id}");
        $this->line("  token     : {$token}");
        $this->newLine();
        $this->warn('Copie ce token maintenant : il ne sera plus jamais affiche.');
        $this->line('Envoie-le dans le header : Authorization: Bearer <token>');

        return self::SUCCESS;
    }
}
