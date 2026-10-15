package com.notesapp.controller;

import com.notesapp.dto.NoteRequest;
import com.notesapp.dto.NoteResponse;
import com.notesapp.entity.Note;
import com.notesapp.entity.User;
import com.notesapp.repository.NoteRepository;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

    private final NoteRepository repository;
    private final com.notesapp.repository.UserRepository userRepository;

    public NoteController(
            NoteRepository repository,
            com.notesapp.repository.UserRepository userRepository) {
        this.repository = repository;
        this.userRepository = userRepository;
    }

    // READ: Get only the logged-in user's notes and purge expired bin notes (> 15 days)
    @GetMapping
    public List<NoteResponse> getAllNotes(
            @AuthenticationPrincipal User user) {

        // Auto-purge notes in bin that are older than 15 days
        try {
            java.time.LocalDateTime cutoff = java.time.LocalDateTime.now().minusDays(15);
            repository.deleteExpiredBinNotes(user.getId(), cutoff);
        } catch (Exception ignored) {
            // Safe fallback if table columns are being initialized
        }

        return repository
                .findAllByUser_IdOrderByUpdatedAtDesc(user.getId())
                .stream()
                .map(NoteResponse::new)
                .toList();
    }

    // READ: Get one note belonging to the logged-in user
    @GetMapping("/{id}")
    public NoteResponse getNote(
            @PathVariable Long id,
            @AuthenticationPrincipal User user) {

        return new NoteResponse(findNote(id, user.getId()));
    }

    // CREATE: Create a note for the logged-in user
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public NoteResponse createNote(
            @RequestBody NoteRequest request,
            @AuthenticationPrincipal User user) {

        Note note = new Note();
        note.setTitle(normalizeTitle(request.getTitle()));
        note.setContent(normalizeContent(request.getContent()));
        if (request.getPinned() != null) {
            note.setPinned(request.getPinned());
        }
        if (request.getArchived() != null) {
            note.setArchived(request.getArchived());
        }
        if (request.getDeleted() != null) {
            note.setDeleted(request.getDeleted());
            if (request.getDeleted()) {
                note.setDeletedAt(java.time.LocalDateTime.now());
            }
        }

        // Ownership comes from the authenticated user, not the request.
        note.setUser(user);

        user.setNotesCreatedCount(user.getNotesCreatedCount() + 1);
        userRepository.save(user);

        return new NoteResponse(repository.save(note));
    }

    // UPDATE: Update only a note belonging to the logged-in user
    @PutMapping("/{id}")
    @Transactional
    public NoteResponse updateNote(
            @PathVariable Long id,
            @RequestBody NoteRequest request,
            @AuthenticationPrincipal User user) {

        Note note = findNote(id, user.getId());

        if (request.getTitle() != null) {
            note.setTitle(normalizeTitle(request.getTitle()));
        }
        if (request.getContent() != null) {
            note.setContent(normalizeContent(request.getContent()));
        }
        if (request.getPinned() != null) {
            note.setPinned(request.getPinned());
        }
        if (request.getArchived() != null) {
            note.setArchived(request.getArchived());
        }
        if (request.getDeleted() != null) {
            note.setDeleted(request.getDeleted());
            if (request.getDeleted()) {
                if (note.getDeletedAt() == null) {
                    note.setDeletedAt(java.time.LocalDateTime.now());
                }
                note.setPinned(false);
            } else {
                note.setDeletedAt(null);
            }
        }

        return new NoteResponse(repository.save(note));
    }

    // TOGGLE PIN
    @PutMapping("/{id}/pin")
    @Transactional
    public NoteResponse togglePin(
            @PathVariable Long id,
            @AuthenticationPrincipal User user) {
        Note note = findNote(id, user.getId());
        note.setPinned(!note.isPinned());
        return new NoteResponse(repository.save(note));
    }

    // TOGGLE ARCHIVE
    @PutMapping("/{id}/archive")
    @Transactional
    public NoteResponse toggleArchive(
            @PathVariable Long id,
            @AuthenticationPrincipal User user) {
        Note note = findNote(id, user.getId());
        note.setArchived(!note.isArchived());
        if (note.isArchived()) {
            note.setPinned(false);
        }
        return new NoteResponse(repository.save(note));
    }

    // RESTORE FROM BIN
    @PutMapping("/{id}/restore")
    @Transactional
    public NoteResponse restoreNote(
            @PathVariable Long id,
            @AuthenticationPrincipal User user) {
        Note note = findNote(id, user.getId());
        note.setDeleted(false);
        note.setDeletedAt(null);
        return new NoteResponse(repository.save(note));
    }

    // EMPTY ENTIRE BIN FOR USER
    @DeleteMapping("/bin")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void emptyBin(@AuthenticationPrincipal User user) {
        repository.emptyBin(user.getId());
    }

    // DELETE: Moves to bin, or permanently deletes if already in bin or permanent=true
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteNote(
            @PathVariable Long id,
            @RequestParam(required = false, defaultValue = "false") boolean permanent,
            @AuthenticationPrincipal User user) {

        Note note = findNote(id, user.getId());
        if (permanent || note.isDeleted()) {
            repository.delete(note);
        } else {
            note.setDeleted(true);
            note.setDeletedAt(java.time.LocalDateTime.now());
            note.setPinned(false);
            repository.save(note);
        }
    }

    private Note findNote(Long id, Long userId) {
        return repository.findByIdAndUser_Id(id, userId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND,
                        "Note not found"));
    }

    private String normalizeTitle(String title) {
        if (title == null || title.isBlank()) {
            return "Untitled";
        }

        return title.trim();
    }

    private Map<String, Object> normalizeContent(
            Map<String, Object> content) {

        if (content == null) {
            return new HashMap<>();
        }

        return content;
    }
}