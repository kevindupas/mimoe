<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlobController;
use App\Http\Controllers\ClipController;
use App\Http\Controllers\PushController;
use Illuminate\Support\Facades\Route;

// Public: instance capabilities, before any account. Lets the client avoid
// offering account creation on a closed instance, rather than letting the
// user fill out a form only to hit a 403 at the end.
// Wide throttle: called once per onboarding, with no side effect.
Route::middleware('throttle:60,1')->get('/server-info', [AuthController::class, 'serverInfo']);

// Public: accounts. Strict throttle -> anti brute-force / account spam.
Route::middleware('throttle:6,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Authenticated (Sanctum token) + per-user throttle (300 req/min: wide,
// covers loading 50 images at once, only blocks abuse).
Route::middleware(['auth:sanctum', 'throttle:300,1'])->group(function () {
    Route::get('/clips', [ClipController::class, 'index']);
    Route::post('/clip', [ClipController::class, 'store']);
    Route::patch('/clip/{id}/pin', [ClipController::class, 'pin']);
    Route::delete('/clip/{id}', [ClipController::class, 'destroy']);
    Route::post('/blob', [BlobController::class, 'store']);
    Route::get('/blob/{id}', [BlobController::class, 'show']);
    Route::post('/push-token', [PushController::class, 'register']);

    // Authenticated account info (email) for the settings screen.
    Route::get('/me', [AuthController::class, 'me']);

    // Right to erasure: deletes the account and ALL its data.
    Route::delete('/account', [AuthController::class, 'deleteAccount']);
});
