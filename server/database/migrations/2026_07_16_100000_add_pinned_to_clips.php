<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Pinned clip: survives the TTL and cap eviction (the one we keep around).
    public function up(): void
    {
        Schema::table('clips', function (Blueprint $table) {
            $table->boolean('pinned')->default(false)->index()->after('mime');
        });
    }

    public function down(): void
    {
        Schema::table('clips', fn (Blueprint $t) => $t->dropColumn('pinned'));
    }
};
