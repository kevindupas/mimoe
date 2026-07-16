<?php

return [
    // TTL des clips : expiration auto apres N heures.
    'ttl_hours' => (int) env('MIMOE_TTL_HOURS', 24),

    // Cap dur : nombre max de clips conserves (le premier atteint entre TTL et cap gagne).
    'max_clips' => (int) env('MIMOE_MAX_CLIPS', 50),

    // Inscription ouverte ? Mettre MIMOE_REGISTRATION_ENABLED=false sur une instance
    // privee (self-hosted perso) pour empecher des inconnus de creer un compte.
    'registration_enabled' => filter_var(env('MIMOE_REGISTRATION_ENABLED', true), FILTER_VALIDATE_BOOL),
];
