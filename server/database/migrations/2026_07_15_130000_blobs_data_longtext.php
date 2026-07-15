<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Une image chiffrée + base64 dépasse vite 64 Ko (limite de TEXT sur MySQL) →
    // troncature silencieuse → déchiffrement GCM cassé → image invisible. LONGTEXT
    // (4 Go) règle ça. Idem pour ciphertext par sécurité (fichiers plus tard).
    public function up(): void
    {
        Schema::table('blobs', fn (Blueprint $t) => $t->longText('data')->change());
        Schema::table('clips', fn (Blueprint $t) => $t->longText('ciphertext')->change());
    }

    public function down(): void
    {
        Schema::table('blobs', fn (Blueprint $t) => $t->text('data')->change());
        Schema::table('clips', fn (Blueprint $t) => $t->text('ciphertext')->change());
    }
};
