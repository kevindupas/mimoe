<?php

use App\Http\Controllers\ClipController;
use Illuminate\Support\Facades\Route;

Route::middleware('device')->group(function () {
    // Params Reverb publics : permet a un appareil appaire de s'auto-configurer.
    Route::get('/config', function () {
        return response()->json([
            'reverb_app_key' => config('reverb.apps.apps.0.key'),
            'reverb_host' => config('reverb.servers.reverb.hostname') ?: request()->getHost(),
            'reverb_port' => (int) config('reverb.servers.reverb.port', 8080),
            'reverb_scheme' => request()->secure() ? 'https' : 'http',
        ]);
    });

    Route::get('/clips', [ClipController::class, 'index']);
    Route::post('/clip', [ClipController::class, 'store']);
});
