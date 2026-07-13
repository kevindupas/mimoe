<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('clips', function (Blueprint $table) {
            $table->foreignId('user_id')->after('id')->constrained()->cascadeOnDelete()->index();
        });

        Schema::table('devices', function (Blueprint $table) {
            $table->foreignId('user_id')->after('id')->constrained()->cascadeOnDelete()->index();
            $table->dropColumn('token_hash'); // auth via Sanctum from now on
        });
    }

    public function down(): void
    {
        Schema::table('clips', fn (Blueprint $t) => $t->dropConstrainedForeignId('user_id'));
        Schema::table('devices', function (Blueprint $t) {
            $t->dropConstrainedForeignId('user_id');
            $t->string('token_hash')->nullable();
        });
    }
};
