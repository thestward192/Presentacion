"""Tool: talent_acquisition_prescreening_handoff_generate

Junta el informe de pre-screening con lo que el candidato respondio en la
conversacion y lo deja listo para el reclutador. NO decide si el candidato
pasa: eso es del humano. No guarda nada -- el guion se vuelve a generar con
las mismas reglas y las respuestas se cruzan por question_id.
"""

from __future__ import annotations

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    AnsweredQuestion,
    CandidateAnswer,
    InterviewHandoff,
    PrescreeningConversation,
    ScreeningReport,
)


class GenerateInterviewHandoff:
    def execute(
        self,
        report: ScreeningReport,
        conversation: PrescreeningConversation,
        answers: list[CandidateAnswer],
    ) -> InterviewHandoff:
        # Respuestas vacias cuentan como no respondidas; ids desconocidos se ignoran.
        by_id = {a.question_id: a.answer.strip() for a in answers if a.answer.strip()}

        answered = [
            AnsweredQuestion(
                question_id=q.question_id,
                topic=q.topic,
                question=q.question,
                answer=by_id.get(q.question_id),
            )
            for q in conversation.questions
        ]

        return InterviewHandoff(
            candidate_id=report.candidate_id,
            vacancy_id=report.vacancy_id,
            score=report.score,
            recommendation=report.recommendation,
            answers=answered,
            unanswered_questions=[a.question_id for a in answered if a.answer is None],
            next_step=(
                "solicitar_cv" if report.recommendation == "no_procesable" else "entrevista_humana"
            ),
        )
