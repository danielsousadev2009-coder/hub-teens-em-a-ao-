export function paginate(req, totalCount, rows, defaultPageSize = 20) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const pageSize = defaultPageSize;
  const totalPages = Math.ceil(totalCount / pageSize);

  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  const baseUrl = `${protocol}://${host}${req.baseUrl}${req.path}`;

  const buildUrl = (targetPage) => {
    if (targetPage < 1 || targetPage > totalPages) return null;
    const url = new URL(baseUrl);
    for (const [key, val] of Object.entries(req.query)) {
      url.searchParams.set(key, val);
    }
    url.searchParams.set('page', String(targetPage));
    return url.toString();
  };

  return {
    count: totalCount,
    next: page < totalPages ? buildUrl(page + 1) : null,
    previous: page > 1 ? buildUrl(page - 1) : null,
    results: rows,
  };
}

export function getPaginationOffset(req, defaultPageSize = 20) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = defaultPageSize;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

