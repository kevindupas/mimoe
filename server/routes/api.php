<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\ClipController;
use Illuminate\Support\Facades\Route;

// Public : comptes
Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

// Authentifié (token Sanctum)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/clips', [ClipController::class, 'index']);
    Route::post('/clip', [ClipController::class, 'store']);
});
