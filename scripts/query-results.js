import { queryReviewResults } from '../src/modules/result-query.js';

function parseArgs(argv) {
  const options = {};

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];

    switch (current) {
      case '--severity':
        options.severity = next;
        i += 1;
        break;
      case '--author':
        options.author = next;
        i += 1;
        break;
      case '--file':
        options.file = next;
        i += 1;
        break;
      case '--commit':
        options.commit = next;
        i += 1;
        break;
      case '--limit':
        options.limit = parseInt(next, 10);
        i += 1;
        break;
      case '--results-dir':
        options.resultsDir = next;
        i += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function printEntry(entry) {
  const commit = entry.result?.commit || {};
  const issues = entry.result?.structuredReview?.issues || [];

  console.log(`commit: ${commit.hash}`);
  console.log(`author: ${commit.authorName} <${commit.authorEmail}>`);
  console.log(`message: ${commit.message}`);
  console.log(`time: ${commit.date}`);
  console.log(`summary: ${entry.result?.structuredReview?.summary || entry.result?.reviewText || ''}`);
  console.log(`issues: ${issues.length}`);
  issues.forEach((issue, index) => {
    console.log(`  ${index + 1}. [${issue.severity}] ${issue.file}:${issue.line}`);
    console.log(`     问题: ${issue.issue}`);
    console.log(`     建议: ${issue.suggestion}`);
  });
  console.log('');
}

const options = parseArgs(process.argv.slice(2));
const result = queryReviewResults(options);

console.log(`results_file: ${result.filePath}`);
console.log(`matched: ${result.count}`);
console.log('');

result.items.forEach(printEntry);
