/* Small text helpers shared by everything that writes sentences.
 *
 * The published titles are Sentence Case ("Register foreign trade contract in
 * UEISFTO", "Obtain certificate of origin Form CT-1"), and dropping them into
 * a sentence needs their case lowered - but not the acronyms and form numbers
 * inside them. `UEISFTO` becoming `ueisfto` reads as a typo, and `Form CT-1`
 * becoming `form ct-1` is wrong: that is the form's name.
 */

/** True for a word that carries its own capitals: an acronym, a form number,
 *  a code. Two or more capitals, or capitals mixed with digits. */
const shouts = (word: string): boolean => {
  const letters = word.replace(/[^A-Za-z0-9-]/g, "");
  if (letters.length < 2) return false;
  const capitals = (letters.match(/[A-Z]/g) ?? []).length;
  return capitals >= 2 || (capitals >= 1 && /\d/.test(letters));
};

/** A title set into the middle of a sentence: lower case, acronyms kept. */
export function inSentence(title: string): string {
  return title
    .split(/(\s+)/)
    .map((word) => (shouts(word) ? word : word.toLowerCase()))
    .join("");
}

/** The same, capitalised, for the start of a sentence. */
export function startsSentence(title: string): string {
  const lowered = inSentence(title);
  return lowered.charAt(0).toUpperCase() + lowered.slice(1);
}
