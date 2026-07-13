<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            // Token push natif (FCM pour Android). Null tant que l'appareil ne l'a pas enregistré.
            $table->string('push_token')->nullable();
            $table->string('push_platform')->nullable(); // android (ios plus tard)
        });
    }

    public function down(): void
    {
        Schema::table('devices', function (Blueprint $table) {
            $table->dropColumn(['push_token', 'push_platform']);
        });
    }
};
