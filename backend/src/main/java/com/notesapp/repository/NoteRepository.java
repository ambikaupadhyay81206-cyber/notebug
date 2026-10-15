package com.notesapp.repository;

import com.notesapp.entity.Note;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, Long> {

    List<Note> findAllByUser_IdOrderByUpdatedAtDesc(Long userId);

    Optional<Note> findByIdAndUser_Id(Long id, Long userId);

    long countByUser_Id(Long userId);

    @Transactional
    @Modifying
    @Query("DELETE FROM Note n WHERE n.user.id = :userId AND n.deleted = true AND n.deletedAt < :cutoff")
    void deleteExpiredBinNotes(@Param("userId") Long userId, @Param("cutoff") LocalDateTime cutoff);

    @Transactional
    @Modifying
    @Query("DELETE FROM Note n WHERE n.user.id = :userId AND n.deleted = true")
    void emptyBin(@Param("userId") Long userId);
}