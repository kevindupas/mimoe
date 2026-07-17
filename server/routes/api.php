<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BlobController;
use App\Http\Controllers\ClipController;
use App\Http\Controllers\PushController;
use Illuminate\Support\Facades\Route;

// Public : capacites de l'instance, avant tout compte. Permet au client de ne pas
// proposer la creation de compte sur une instance fermee, plutot que de laisser
// l'utilisateur remplir un formulaire pour se prendre un 403 a la fin.
// Throttle large : appele une fois par onboarding, sans effet de bord.
Route::middleware('throttle:60,1')->get('/server-info', [AuthController::class, 'serverInfo']);

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
    Route::patch('/clip/{id}/pin', [ClipController::class, 'pin']);
    Route::delete('/clip/{id}', [ClipController::class, 'destroy']);
    Route::post('/blob', [BlobController::class, 'store']);
    Route::get('/blob/{id}', [BlobController::class, 'show']);
    Route::post('/push-token', [PushController::class, 'register']);
});
