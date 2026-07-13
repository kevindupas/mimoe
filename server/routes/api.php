<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlobController;
use App\Http\Controllers\ClipController;
use App\Http\Controllers\PushController;
use Illuminate\Support\Facades\Route;

// Public : comptes. Throttle strict -> anti brute-force / spam de comptes.
Route::middleware('throttle:6,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/login', [AuthController::class, 'login']);
});

// Authentifié (token Sanctum) + throttle par utilisateur (300 req/min : large,
// couvre le chargement de 50 images d'un coup, bloque juste l'abus).
Route::middleware(['auth:sanctum', 'throttle:300,1'])->group(function () {
    Route::get('/clips', [ClipController::class, 'index']);
    Route::post('/clip', [ClipController::class, 'store']);
    Route::delete('/clip/{id}', [ClipController::class, 'destroy']);
    Route::post('/blob', [BlobController::class, 'store']);
    Route::get('/blob/{id}', [BlobController::class, 'show']);
    Route::post('/push-token', [PushController::class, 'register']);
});
