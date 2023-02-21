/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "fs";
import * as util from "util";
import * as path from "path";

var directory = process.argv.slice(2)[0];

let files  = [];

const getFilesRecursively = (directory) => {
    const filesInDirectory = fs.readdirSync(directory);
    for (const file of filesInDirectory) {
      const absolute = path.join(directory, file);
      if (fs.statSync(absolute).isDirectory()) {
          getFilesRecursively(absolute);
      } else if (/junit-report.json$/.test(absolute)) {
          files.push(absolute);
      }
    }
  }

getFilesRecursively(directory);

let output = [];
for(const filename of files) {
    const jsonData = fs.readFileSync(filename,  'utf8');

    const failedTests = JSON.parse(jsonData).failures;

    if(failedTests.length > 0) output.push(failedTests)
}

console.log(util.inspect(output, false, null, true))