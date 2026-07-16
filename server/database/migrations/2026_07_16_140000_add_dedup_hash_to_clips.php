<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Empreinte du contenu (fournie par le client, opaque pour le serveur) : sert
    // UNIQUEMENT à ignorer les doublons techniques (même appareil, très rapprochés).
    public function up(): void
    {
        Schema::table('clips', function (Blueprint $table) {
            $table->string('dedup_hash')->nullable()->after('mime');
            $table->index(['user_id', 'origin_device_id', 'dedup_hash']);
        });
    }

    public function down(): void
    {
        Schema::table('clips', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'origin_device_id', 'dedup_hash']);
            $table->dropColumn('dedup_hash');
        });
    }
};
