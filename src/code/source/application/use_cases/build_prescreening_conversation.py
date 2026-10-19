"""Tool: talent_acquisition_prescreening_conversation_get

Arma el guion de una conversacion breve bot-candidato antes de la entrevista
humana, a partir del informe de pre-screening. Deterministico a proposito:
el MCP decide QUE preguntar con reglas fijas; la conversacion en lenguaje
natural la lleva el agente que consume esta tool.

Prioridad de las preguntas (maximo _MAX_QUESTIONS):

1. CV "no_procesable" -> una sola pregunta: pedir el CV de nuevo.
2. Inconsistencias del CV -> pedir que las aclare.
3. Requisitos faltantes -> verificar si los tiene aunque el CV no lo diga.
4. Si queda espacio -> motivacion y disponibilidad.
"""

from __future__ import annotations

import re

from novahub_people_mcp.modules.talent_acquisition.domain.prescreening import (
    ConversationQuestion,
    PrescreeningConversation,
    ScreeningReport,
)

_MAX_QUESTIONS = 5
# Lo genera EvaluateCandidateMatch: "experiencia_minima_3.0_anos".
_MIN_EXPERIENCE = re.compile(r"^experiencia_minima_(\d+(?:\.\d+)?)_anos$")


def _format_years(years: float) -> str:
    return str(int(years)) if years.is_integer() else str(years)


def _requirement_question(requirement: str) -> str:
    match = _MIN_EXPERIENCE.match(requirement)
    if match:
        years = _format_years(float(match.group(1)))
        return (
            f"La vacante pide al menos {years} anos de experiencia. "
            "Cuantos anos de experiencia profesional tienes en el area?"
        )
    return (
        f"La vacante pide {requirement}. Tienes experiencia con {requirement}? "
        "Cuentanos donde la usaste y por cuanto tiempo."
    )


class BuildPrescreeningConversation:
    def execute(self, report: ScreeningReport) -> PrescreeningConversation:
        greeting = (
            f"Hola, gracias por postularte a la vacante {report.vacancy_id}. Antes de "
            "agendar la entrevista con el equipo queremos hacerte unas preguntas breves."
        )

        if report.recommendation == "no_procesable":
            return PrescreeningConversation(
                candidate_id=report.candidate_id,
                vacancy_id=report.vacancy_id,
                greeting=f"Hola, gracias por postularte a la vacante {report.vacancy_id}.",
                questions=[
                    ConversationQuestion(
                        question_id="q1",
                        topic="solicitar_cv",
                        question=(
                            f"No pudimos leer tu CV ({report.unprocessable_reason}). "
                            "Puedes enviarlo de nuevo en PDF o Word con texto seleccionable?"
                        ),
                    )
                ],
                closing="Cuando recibamos tu CV continuaremos con el proceso. Gracias!",
            )

        topics_and_questions: list[tuple[str, str]] = []
        for issue in report.inconsistencies:
            topics_and_questions.append(
                (
                    "aclarar_inconsistencia",
                    f"Notamos algo que queremos aclarar en tu CV: {issue}. "
                    "Nos ayudas a entenderlo?",
                )
            )
        for requirement in report.missing_requirements:
            topics_and_questions.append(("verificar_requisito", _requirement_question(requirement)))
        topics_and_questions.append(("motivacion", "Por que te interesa esta posicion?"))
        topics_and_questions.append(
            ("disponibilidad", "Cual es tu disponibilidad para una entrevista con el equipo?")
        )

        questions = [
            ConversationQuestion(question_id=f"q{i}", topic=topic, question=question)
            for i, (topic, question) in enumerate(topics_and_questions[:_MAX_QUESTIONS], start=1)
        ]

        return PrescreeningConversation(
            candidate_id=report.candidate_id,
            vacancy_id=report.vacancy_id,
            greeting=greeting,
            questions=questions,
            closing=(
                "Gracias por tu tiempo. Una persona del equipo revisara tus respuestas "
                "y te contactara para los siguientes pasos."
            ),
        )
