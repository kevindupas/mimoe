<?php

use Illuminate\Support\Facades\Broadcast;

// Canal prive unique (mono-utilisateur v1). Tout appareil authentifie
// (device token, resolu par le middleware `device`) peut ecouter.
Broadcast::channel('clips', function ($device) {
    return $device !== null;
});
