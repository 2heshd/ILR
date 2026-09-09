const A_BEFORE_VOWEL_SOUND = /\ba (?!(?:uni(?:versity|t)|use(?:r|ful)?|usual|euro|one\b))(?=[aeiou])/i;

/** Generated English answers use explicit roles or singular they, never guessed gender. */
export function repairPracticeAnswerArticles(questions: unknown) {
  if (!Array.isArray(questions)) return questions;
  return questions.map((question) => {
    if (!question || typeof question !== 'object' || typeof question.referenceAnswer !== 'string') return question;
    return {
      ...question,
      referenceAnswer: question.referenceAnswer.replace(new RegExp(A_BEFORE_VOWEL_SOUND.source, 'gi'), (article: string) => article[0] === 'A' ? 'An ' : 'an '),
    };
  });
}

export function practiceAnswerIssues(questions: unknown): string[] {
  if (!Array.isArray(questions) || questions.length < 3 || questions.length > 5) return ['Return three to five questions.'];
  const issues: string[] = [];
  for (const question of questions) {
    if (!question || typeof question.question !== 'string' || typeof question.referenceAnswer !== 'string' || !/[A-Za-z]{2,}/.test(question.question) || !/[A-Za-z]{2,}/.test(question.referenceAnswer)) {
      issues.push('Write questions and reference answers in English.');
      continue;
    }
    if (/\b(?:he|she|his|her|him|hers)\b/i.test(question.referenceAnswer)) issues.push('Use the explicit participant role or singular they in the answer, not gendered pronouns.');
    if (A_BEFORE_VOWEL_SOUND.test(question.referenceAnswer)) issues.push('Use “an” before an English vowel sound.');
  }
  return [...new Set(issues)];
}
