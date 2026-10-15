package com.notesapp.controller;

import com.notesapp.entity.Feedback;
import com.notesapp.entity.User;
import com.notesapp.repository.FeedbackRepository;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/feedback")
public class FeedbackController {

    private final FeedbackRepository feedbackRepository;

    public FeedbackController(FeedbackRepository feedbackRepository) {
        this.feedbackRepository = feedbackRepository;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> submitFeedback(
            @RequestBody Map<String, String> request,
            @AuthenticationPrincipal User user) {
        String message = request.get("message");

        if (message == null || message.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Feedback message is required.");
        }

        if (message.trim().length() > 2000) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Feedback must be 2000 characters or fewer.");
        }

        feedbackRepository.save(new Feedback(user, message.trim()));
        return Map.of("message", "Feedback received. Thank you!");
    }
}
