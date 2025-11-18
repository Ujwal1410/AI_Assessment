from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from ..db.mongo import get_db
from ..utils.mongo import to_object_id
from ..utils.responses import success_response

router = APIRouter(prefix="/api/assessment", tags=["candidate"])


@router.post("/verify-candidate")
async def verify_candidate(
    payload: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Verify candidate email and name against assessment candidates list."""
    assessment_id = payload.get("assessmentId")
    token = payload.get("token")
    email = payload.get("email", "").strip().lower()
    name = payload.get("name", "").strip()

    if not assessment_id or not token or not email or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    try:
        oid = to_object_id(assessment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Verify candidate
    candidates = assessment.get("candidates", [])
    candidate_found = any(
        c.get("email", "").strip().lower() == email and c.get("name", "").strip() == name
        for c in candidates
    )

    if not candidate_found:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Email and name combination not found in candidate list")

    return success_response("Candidate verified successfully", {"verified": True})


@router.get("/get-schedule")
async def get_assessment_schedule(
    assessmentId: str = Query(...),
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get assessment schedule for candidates."""
    try:
        oid = to_object_id(assessmentId)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    schedule = assessment.get("schedule", {})
    return success_response(
        "Schedule fetched successfully",
        {
            "startTime": schedule.get("startTime"),
            "endTime": schedule.get("endTime"),
            "timezone": schedule.get("timezone", "Asia/Kolkata"),
        }
    )


@router.get("/get-questions")
async def get_assessment_questions(
    assessmentId: str = Query(...),
    token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get assessment questions for candidates."""
    try:
        oid = to_object_id(assessmentId)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Collect all questions from all topics
    all_questions = []
    for topic in assessment.get("topics", []):
        topic_questions = topic.get("questions", [])
        for question in topic_questions:
            all_questions.append(question)

    # Get questionTypeTimes from assessment
    question_type_times = assessment.get("questionTypeTimes", {})
    
    return success_response(
        "Questions fetched successfully",
        {
            "questions": all_questions,
            "questionTypeTimes": question_type_times,
        }
    )


@router.post("/submit-answers")
async def submit_candidate_answers(
    payload: Dict[str, Any],
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Submit candidate answers and calculate score."""
    assessment_id = payload.get("assessmentId")
    token = payload.get("token")
    email = payload.get("email", "").strip().lower()
    name = payload.get("name", "").strip()
    answers = payload.get("answers", [])
    skipped_questions = payload.get("skippedQuestions", [])

    if not assessment_id or not token or not email or not name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required fields")

    try:
        oid = to_object_id(assessment_id)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid assessment ID")

    assessment = await db.assessments.find_one({"_id": oid})
    if not assessment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found")

    # Verify token
    if assessment.get("assessmentToken") != token:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid assessment token")

    # Verify candidate
    candidates = assessment.get("candidates", [])
    candidate_found = any(
        c.get("email", "").strip().lower() == email and c.get("name", "").strip() == name
        for c in candidates
    )
    if not candidate_found:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate not found")

    # Collect all questions
    all_questions = []
    for topic in assessment.get("topics", []):
        topic_questions = topic.get("questions", [])
        for question in topic_questions:
            all_questions.append(question)

    # Calculate score
    total_score = 0
    max_score = 0
    correct_answers = 0
    attempted = len(answers)
    not_attempted = len(all_questions) - attempted - len(skipped_questions)

    for idx, question in enumerate(all_questions):
        max_score += question.get("score", 5)
        answer_obj = next((a for a in answers if a.get("questionIndex") == idx), None)
        
        if answer_obj:
            if question.get("type") == "MCQ":
                if answer_obj.get("answer") == question.get("correctAnswer"):
                    total_score += question.get("score", 5)
                    correct_answers += 1
            # For subjective/descriptive, we'll need manual evaluation later
            # For now, just mark as attempted

    # Store candidate response
    candidate_responses = assessment.get("candidateResponses", {})
    candidate_key = f"{email}_{name}"
    candidate_responses[candidate_key] = {
        "email": email,
        "name": name,
        "answers": answers,
        "skippedQuestions": skipped_questions,
        "score": total_score,
        "maxScore": max_score,
        "attempted": attempted,
        "notAttempted": not_attempted,
        "correctAnswers": correct_answers,
        "submittedAt": datetime.now(timezone.utc).isoformat(),
    }
    assessment["candidateResponses"] = candidate_responses
    await db.assessments.replace_one({"_id": oid}, assessment)

    return success_response(
        "Answers submitted successfully",
        {
            "score": total_score,
            "maxScore": max_score,
            "attempted": attempted,
            "notAttempted": not_attempted,
            "correctAnswers": correct_answers,
        }
    )

