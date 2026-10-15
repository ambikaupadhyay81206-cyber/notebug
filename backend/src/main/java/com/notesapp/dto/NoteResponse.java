package com.notesapp.dto;

import java.time.LocalDateTime;
import java.util.Map;

import com.notesapp.entity.Note;

public class NoteResponse {

    private String id;
    private String title;
    private Map<String, Object> content;
    private boolean pinned;
    private boolean archived;
    private boolean deleted;
    private LocalDateTime deletedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public NoteResponse(Note note) {
        this.id = String.format("%03d", note.getId());
        this.title = note.getTitle();
        this.content = note.getContent();
        this.pinned = note.isPinned();
        this.archived = note.isArchived();
        this.deleted = note.isDeleted();
        this.deletedAt = note.getDeletedAt();
        this.createdAt = note.getCreatedAt();
        this.updatedAt = note.getUpdatedAt();
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public Map<String, Object> getContent() {
        return content;
    }

    public boolean isPinned() {
        return pinned;
    }

    public boolean isArchived() {
        return archived;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public LocalDateTime getDeletedAt() {
        return deletedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}