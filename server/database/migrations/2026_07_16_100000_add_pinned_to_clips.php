<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Clip épinglé : survit au TTL et à l'éviction du cap (le truc qu'on garde).
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
