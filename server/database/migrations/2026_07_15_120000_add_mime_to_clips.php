<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Type MIME du contenu (ex. image/png, image/gif) pour restituer le format
        // d'origine côté clients. Opaque pour le serveur, non sensible.
        Schema::table('clips', function (Blueprint $table) {
            $table->string('mime')->nullable()->after('blob_id');
        });
    }

    public function down(): void
    {
        Schema::table('clips', fn (Blueprint $t) => $t->dropColumn('mime'));
    }
};
