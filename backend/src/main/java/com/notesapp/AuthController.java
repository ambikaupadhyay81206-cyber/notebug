
package com.notesapp;

import com.notesapp.dto.LoginRequest;
import com.notesapp.dto.SignupRequest;
import com.notesapp.entity.User;
import com.notesapp.repository.UserRepository;
import com.notesapp.security.JwtService;

import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final com.notesapp.repository.NoteRepository noteRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    public AuthController(
            UserRepository userRepository,
            com.notesapp.repository.NoteRepository noteRepository,
            PasswordEncoder passwordEncoder,
            JwtService jwtService) {
        this.userRepository = userRepository;
        this.noteRepository = noteRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
    }

    @PostMapping("/signup")
    public ResponseEntity<?> signup(
            @Valid @RequestBody SignupRequest request) {

        String email = request.getEmail().trim().toLowerCase();

        if (userRepository.existsByEmail(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of(
                            "message",
                            "An account with this email already exists."
                    ));
        }

        User user = new User();
        user.setName(request.getName().trim());
        user.setEmail(email);
        user.setPasswordHash(
                passwordEncoder.encode(request.getPassword())
        );

        User savedUser = userRepository.save(user);

        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of(
                        "message", "Account created successfully.",
                        "userId", String.format("%03d", savedUser.getId()),
                        "name", savedUser.getName(),
                        "email", savedUser.getEmail(),
                        "createdAt", savedUser.getCreatedAt() != null ? savedUser.getCreatedAt().toString() : java.time.LocalDateTime.now().toString(),
                        "notesCreatedCount", 0
                ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(
            @Valid @RequestBody LoginRequest request) {

        String email = request.getEmail().trim().toLowerCase();

        var optionalUser = userRepository.findByEmail(email);

        if (optionalUser.isEmpty()
                || !passwordEncoder.matches(
                        request.getPassword(),
                        optionalUser.get().getPasswordHash())) {

            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of(
                            "message", "Invalid email or password."
                    ));
        }

        User user = optionalUser.get();
        String token = jwtService.generateToken(user.getEmail());
        long notesCount = Math.max(user.getNotesCreatedCount(), noteRepository.countByUser_Id(user.getId()));

        return ResponseEntity.ok(
                Map.of(
                        "message", "Login successful.",
                        "token", token,
                        "tokenType", "Bearer",
                        "expiresIn", 3600,
                        "userId", String.format("%03d", user.getId()),
                        "name", user.getName(),
                        "email", user.getEmail(),
                        "createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : java.time.LocalDateTime.now().toString(),
                        "notesCreatedCount", notesCount
                )
        );
    }

    @GetMapping("/me")
    public ResponseEntity<?> currentUser(
            @AuthenticationPrincipal User user) {
        long notesCount = Math.max(user.getNotesCreatedCount(), noteRepository.countByUser_Id(user.getId()));
        return ResponseEntity.ok(Map.of(
                "userId", String.format("%03d", user.getId()),
                "name", user.getName(),
                "email", user.getEmail(),
                "createdAt", user.getCreatedAt() != null ? user.getCreatedAt().toString() : java.time.LocalDateTime.now().toString(),
                "notesCreatedCount", notesCount
        ));
    }

    @PutMapping("/me")
    public ResponseEntity<?> updateCurrentUser(
            @AuthenticationPrincipal User user,
            @RequestBody Map<String, String> request) {
        String name = request.get("name");

        if (name == null || name.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", "Name is required."
            ));
        }

        if (name.trim().length() > 100) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", "Name must be 100 characters or fewer."
            ));
        }

        user.setName(name.trim());
        User savedUser = userRepository.save(user);
        long notesCount = Math.max(savedUser.getNotesCreatedCount(), noteRepository.countByUser_Id(savedUser.getId()));

        return ResponseEntity.ok(Map.of(
                "userId", String.format("%03d", savedUser.getId()),
                "name", savedUser.getName(),
                "email", savedUser.getEmail(),
                "createdAt", savedUser.getCreatedAt() != null ? savedUser.getCreatedAt().toString() : java.time.LocalDateTime.now().toString(),
                "notesCreatedCount", notesCount
        ));
    }

}
