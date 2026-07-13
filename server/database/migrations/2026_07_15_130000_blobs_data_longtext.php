<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // An encrypted + base64 image quickly exceeds 64 KB (TEXT limit on MySQL) →
    // silent truncation → broken GCM decryption → invisible image. LONGTEXT
    // (4 GB) fixes this. Same for ciphertext as a safety net (files later).
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
