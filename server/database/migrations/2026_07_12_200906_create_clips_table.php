<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clips', function (Blueprint $table) {
            $table->uuid('id')->primary(); // genere cote client
            $table->uuid('origin_device_id')->index();
            $table->text('ciphertext');    // AES-256-GCM, opaque cote serveur
            $table->string('nonce');       // IV du GCM, base64, par message
            $table->boolean('is_sensitive')->default(false);
            $table->timestamp('created_at');
            $table->timestamp('expires_at')->index(); // TTL, fixe a l'insertion
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clips');
    }
};
