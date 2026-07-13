<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('clips', function (Blueprint $table) {
            $table->uuid('id')->primary(); // generated client-side
            $table->uuid('origin_device_id')->index();
            $table->text('ciphertext');    // AES-256-GCM, opaque server-side
            $table->string('nonce');       // GCM IV, base64, per message
            $table->boolean('is_sensitive')->default(false);
            $table->timestamp('created_at');
            $table->timestamp('expires_at')->index(); // TTL, set at insertion
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('clips');
    }
};
