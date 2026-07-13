<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // MIME type of the content (e.g. image/png, image/gif) to restore the
        // original format on the clients. Opaque to the server, not sensitive.
        Schema::table('clips', function (Blueprint $table) {
            $table->string('mime')->nullable()->after('blob_id');
        });
    }

    public function down(): void
    {
        Schema::table('clips', fn (Blueprint $t) => $t->dropColumn('mime'));
    }
};
