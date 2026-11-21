// solve.js — a fast drop-in for csv-reader 1.0.0, make.fun's own CSV reader.
//
// It answers exactly as csv-reader 1.0.0 does for every input {text, header}:
// {columns, rows, errors}. The reading policy, restated from the competition
// rules, is:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote and each CRLF or lone CR inside it read
//     as LF; what follows its closing quote, up to the next comma or line
//     break, is appended as it stands (quote_junk, when the field ends); a
//     quote that never closes is a literal character, and the text after it is
//     read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its field count) or cut (long_row,
//     with extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when it ends: line the 1-based line its record
//     starts on, counting every LF, CRLF and lone CR inside quotes, and row
//     its record's index in rows, null for the header.
//
// Speed comes from never reading one character at a time: fields are cut out
// of the text with indexOf/slice, whole lines with no quoted field are split
// at once, and a quoted field is found with indexOf('"') jumps instead of a
// scan. Nothing is kept from one call to the next.

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  // The next character to read, and the line it is on (1-based).
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  // The record being read: the line it starts on and its index in rows.
  let recordLine = 1;
  let recordRow = null;
  // Index of the next LF at or after pos, or len when there is none; -1
  // means it is not known and must be looked up again.
  let nl = -1;
  // How the field being read ended: 0 comma, 1 line break, 2 end of text.
  let ended = 0;

  // Reads an unquoted field starting at pos, with `prefix` already in its
  // value: '' for a plain field, the quoted content for what follows a
  // closing quote, '"' for the re-read after a quote that never closes.
  // Sets `ended`, moves pos/line past the field, and returns its value.
  // Used only on the cold paths (junk after a closing quote, and the
  // unterminated re-read); the plain path in the loop below is inlined.
  function scanUnquoted(prefix) {
    if (nl < pos) {
      nl = text.indexOf('\n', pos);
      if (nl === -1) nl = len;
    }
    const comma = text.indexOf(',', pos);
    let end;
    if (comma !== -1 && comma < nl) {
      end = comma;
      ended = 0;
    } else if (nl < len) {
      end = nl;
      ended = 1;
    } else {
      end = len;
      ended = 2;
    }
    let segEnd = end;
    // A CR right before the LF is the CRLF break itself, not part of the
    // field; any other CR in the slice is a stray one.
    if (ended === 1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
    let chunk = text.slice(pos, segEnd);
    if (chunk.indexOf('\r') !== -1) {
      const parts = chunk.split('\r');
      for (let i = 1; i < parts.length; i += 1) {
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      }
      chunk = parts.join('');
    }
    if (ended === 0) pos = end + 1;
    else if (ended === 1) {
      pos = end + 1;
      line += 1;
    } else pos = len;
    return prefix + chunk;
  }

  while (pos < len) {
    // Lines with no characters are no records.
    let c = text.charCodeAt(pos);
    while (c === 10 || (c === 13 && text.charCodeAt(pos + 1) === 10)) {
      pos += c === 10 ? 1 : 2;
      line += 1;
      if (pos >= len) break;
      c = text.charCodeAt(pos);
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // End of this line: the next LF, or the end of the text.
    let le = text.indexOf('\n', pos);
    if (le === -1) le = len;

    // Does any field of this line open with a quote? A quote at the line's
    // start or right after a comma opens one; any other quote is literal.
    let quotedLine = false;
    let q = text.indexOf('"', pos);
    while (q !== -1 && q < le) {
      if (q === pos || text.charCodeAt(q - 1) === 44) {
        quotedLine = true;
        break;
      }
      q = text.indexOf('"', q + 1);
    }

    let fields;
    if (!quotedLine) {
      // No field opens with a quote, so the record ends at this line: cut
      // the whole line out and split it at once.
      let segEnd = le;
      if (le < len && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
      let lineText = text.slice(pos, segEnd);
      if (lineText.indexOf('\r') !== -1) {
        const parts = lineText.split('\r');
        for (let i = 1; i < parts.length; i += 1) {
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        }
        lineText = parts.join('');
      }
      if (lineText === '') {
        // A line that held only stray CRs is no record (its errors stay).
        pos = le < len ? le + 1 : len;
        if (le < len) line += 1;
        continue;
      }
      fields = lineText.split(',');
      pos = le < len ? le + 1 : len;
      if (le < len) line += 1;
    } else {
      // Field by field: some field of this record opens with a quote.
      nl = le;
      fields = [];
      let lastQuoted = false;
      do {
        let value;
        if (text.charCodeAt(pos) === 34) {
          lastQuoted = true;
          // A quoted field: jump from quote to quote for its close.
          const open = pos;
          const openLine = line;
          pos += 1;
          let qq = pos;
          let hasDoubled = false;
          for (;;) {
            qq = text.indexOf('"', qq);
            if (qq === -1) break;
            if (text.charCodeAt(qq + 1) === 34) {
              hasDoubled = true;
              qq += 2;
              continue;
            }
            break;
          }
          if (qq === -1) {
            // The quote never closes: it is a literal character, and the
            // text after it is read again as unquoted.
            pos = open + 1;
            line = openLine;
            nl = -1;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            value = scanUnquoted('"');
          } else {
            let seg = text.slice(open + 1, qq);
            const hasCR = seg.indexOf('\r') !== -1;
            const hasLF = seg.indexOf('\n') !== -1;
            // Each CRLF or lone CR inside quotes is one LF in the value.
            if (hasCR) seg = seg.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
            if (hasCR || hasLF) {
              // After that rewrite every line break inside is one LF.
              let breaks = 0;
              let idx = -1;
              while ((idx = seg.indexOf('\n', idx + 1)) !== -1) breaks += 1;
              line += breaks;
            }
            if (hasDoubled) seg = seg.replaceAll('""', '"');
            pos = qq + 1;
            nl = -1;
            if (pos >= len) {
              value = seg;
              ended = 2;
            } else {
              const nc = text.charCodeAt(pos);
              if (nc === 44) {
                value = seg;
                ended = 0;
                pos += 1;
              } else if (nc === 10) {
                value = seg;
                ended = 1;
                pos += 1;
                line += 1;
              } else if (nc === 13 && text.charCodeAt(pos + 1) === 10) {
                value = seg;
                ended = 1;
                pos += 2;
                line += 1;
              } else {
                // What follows the closing quote is appended as it stands.
                value = scanUnquoted(seg);
                if (value.length > seg.length) {
                  errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
                }
              }
            }
          }
        } else {
          lastQuoted = false;
          // An unquoted field: cut it out at the next comma or line break.
          if (nl < pos) {
            nl = text.indexOf('\n', pos);
            if (nl === -1) nl = len;
          }
          const comma = text.indexOf(',', pos);
          let end;
          if (comma !== -1 && comma < nl) {
            end = comma;
            ended = 0;
          } else if (nl < len) {
            end = nl;
            ended = 1;
          } else {
            end = len;
            ended = 2;
          }
          let segEnd = end;
          if (ended === 1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) segEnd -= 1;
          value = text.slice(pos, segEnd);
          if (value.indexOf('\r') !== -1) {
            const parts = value.split('\r');
            for (let i = 1; i < parts.length; i += 1) {
              errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            }
            value = parts.join('');
          }
          if (ended === 0) pos = end + 1;
          else if (ended === 1) {
            pos = end + 1;
            line += 1;
          } else pos = len;
        }
        fields.push(value);
      } while (ended === 0);
      // A line that held only stray CRs is no record (its errors stay).
      if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
