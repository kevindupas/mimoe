package app.clipd

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** Bus partagé entre le service de réception et l'UI. */
object ClipBus {
    private val _clips = MutableStateFlow<List<Clip>>(emptyList())
    val clips: StateFlow<List<Clip>> = _clips

    fun set(list: List<Clip>) { _clips.value = list }

    fun add(clip: Clip) {
        if (_clips.value.any { it.id == clip.id }) return
        _clips.value = (listOf(clip) + _clips.value).take(100)
    }
}
