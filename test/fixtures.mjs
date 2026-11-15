/** A minimal valid page; override the head or body to build a broken one. */
export function page({ head = '', body = '<main><h1>Title</h1></main>' } = {}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Title</title>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}
