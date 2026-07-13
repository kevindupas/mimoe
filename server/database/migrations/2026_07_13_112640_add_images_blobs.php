<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Encrypted blobs (images): uploaded separately from the WebSocket.
        Schema::create('blobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete()->index();
            $table->text('data');          // encrypted bytes (AES-256-GCM), opaque base64
            $table->string('nonce');       // blob IV
            $table->timestamp('expires_at')->index();
        });

        Schema::table('clips', function (Blueprint $table) {
            $table->string('kind')->default('text')->after('user_id'); // text | image
            $table->uuid('blob_id')->nullable()->after('kind');        // pointer to blobs (image)
        });
    }

    public function down(): void
    {
        Schema::table('clips', fn (Blueprint $t) => $t->dropColumn(['kind', 'blob_id']));
        Schema::dropIfExists('blobs');
    }
};
