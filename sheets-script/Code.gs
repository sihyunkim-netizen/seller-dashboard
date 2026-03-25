// ============================================================
// 설정값 (여기만 수정하면 됨)
// ============================================================
const CONFIG = {
  REDASH_BASE: 'https://redash.myrealtrip.net',
  QUERY_1_ID: 23544,   // 마케팅파트너 예약 전체 RAW
  QUERY_2_ID: 24553,   // 시간별 판매현황
  PARTNER_ID: '129271',
  GIDS: '2705226,2680807,5548240',
  DAYS_RANGE: 30,      // 최근 며칠치 데이터를 가져올지
};

// ============================================================
// 메인 실행 함수 (트리거에 이걸 연결)
// ============================================================
function runAll() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('REDASH_API_KEY');
  if (!apiKey) {
    throw new Error('REDASH_API_KEY가 설정되지 않았습니다. 스크립트 속성에서 추가해주세요.');
  }

  const endDate = formatDate(new Date());
  const startDate = formatDate(nDaysAgo(CONFIG.DAYS_RANGE));

  Logger.log(`데이터 조회 기간: ${startDate} ~ ${endDate}`);

  // 쿼리1: 마케팅파트너 예약 전체
  const q1rows = fetchRedash(CONFIG.QUERY_1_ID, {
    start_date: startDate,
    end_date: endDate,
  }, apiKey);

  if (q1rows) {
    const myRows = q1rows.filter(r => String(r.partner_id) === CONFIG.PARTNER_ID);
    Logger.log(`쿼리1 내 파트너 데이터: ${myRows.length}건`);
    writeKPI(myRows);
    writeOptions(myRows);
    writeLinks(myRows);
  }

  // 쿼리2: 시간별 판매현황
  const q2rows = fetchRedash(CONFIG.QUERY_2_ID, {
    trunc_by: 'HOUR',
    start_date: startDate,
    end_date: endDate,
    gid: CONFIG.GIDS,
  }, apiKey);

  if (q2rows) {
    Logger.log(`쿼리2 시간별 데이터: ${q2rows.length}건`);
    writeHourly(q2rows);
  }

  Logger.log('완료!');
}

// ============================================================
// Redash API 호출
// ============================================================
function fetchRedash(queryId, params, apiKey) {
  const url = `${CONFIG.REDASH_BASE}/api/queries/${queryId}/results`;

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify({ parameters: params }),
    muteHttpExceptions: true,
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());

  if (json.query_result) {
    return json.query_result.data.rows;
  }

  if (json.job) {
    return pollJob(json.job.id, apiKey);
  }

  Logger.log(`쿼리 ${queryId} 오류: ${res.getContentText()}`);
  return null;
}

function pollJob(jobId, apiKey) {
  const maxAttempts = 20;

  for (let i = 0; i < maxAttempts; i++) {
    Utilities.sleep(3000);

    const res = UrlFetchApp.fetch(`${CONFIG.REDASH_BASE}/api/jobs/${jobId}`, {
      headers: { 'Authorization': `Key ${apiKey}` },
      muteHttpExceptions: true,
    });

    const job = JSON.parse(res.getContentText()).job;
    Logger.log(`Job 상태: ${job.status} (${i + 1}/${maxAttempts})`);

    if (job.status === 3) {
      const resultRes = UrlFetchApp.fetch(
        `${CONFIG.REDASH_BASE}/api/query_results/${job.query_result_id}`,
        { headers: { 'Authorization': `Key ${apiKey}` } }
      );
      return JSON.parse(resultRes.getContentText()).query_result.data.rows;
    }

    if (job.status === 4) {
      Logger.log('쿼리 실행 실패');
      return null;
    }
  }

  Logger.log('타임아웃');
  return null;
}

// ============================================================
// 시트 쓰기 함수들
// ============================================================
function writeKPI(rows) {
  const sheet = getOrCreateSheet('KPI요약');
  sheet.clearContents();

  const confirmed = rows.filter(r =>
    ['confirm', 'finish'].includes(String(r.RECENT_STATUS || '').toLowerCase())
  );
  const cancelled = rows.filter(r =>
    String(r.RECENT_STATUS || '').toLowerCase() === 'cancel'
  );

  const totalGMV = confirmed.reduce((sum, r) => sum + (Number(r.SALES_KRW_PRICE) || 0), 0);
  const totalCommission = rows.reduce((sum, r) => sum + (Number(r.partnership_commission) || 0), 0);
  const cancelRate = rows.length > 0
    ? (cancelled.length / rows.length * 100).toFixed(1)
    : '0.0';

  sheet.getRange('A1:B7').setValues([
    ['업데이트시각', new Date().toLocaleString('ko-KR')],
    ['조회기간', `최근 ${CONFIG.DAYS_RANGE}일`],
    ['예약건수', confirmed.length],
    ['총거래액', totalGMV],
    ['취소율', cancelRate + '%'],
    ['정산예정금액', totalCommission],
    ['전체행수', rows.length],
  ]);
}

function writeOptions(rows) {
  const sheet = getOrCreateSheet('옵션별');
  sheet.clearContents();

  const confirmed = rows.filter(r =>
    ['confirm', 'finish'].includes(String(r.RECENT_STATUS || '').toLowerCase())
  );

  const map = {};
  confirmed.forEach(r => {
    const title = r.PRODUCT_TITLE || '기타';
    if (!map[title]) map[title] = { 예약건수: 0, 거래액: 0 };
    map[title].예약건수++;
    map[title].거래액 += Number(r.SALES_KRW_PRICE) || 0;
  });

  const header = [['상품명', '예약건수', '거래액']];
  const dataRows = Object.entries(map)
    .sort((a, b) => b[1].예약건수 - a[1].예약건수)
    .map(([name, v]) => [name, v.예약건수, v.거래액]);

  sheet.getRange(1, 1, 1, 3).setValues(header);
  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, 3).setValues(dataRows);
  }
}

function writeLinks(rows) {
  const sheet = getOrCreateSheet('마이링크별');
  sheet.clearContents();

  const confirmed = rows.filter(r =>
    ['confirm', 'finish'].includes(String(r.RECENT_STATUS || '').toLowerCase())
  );

  const map = {};
  confirmed.forEach(r => {
    const linkId = r.marketing_link_id || '없음';
    if (!map[linkId]) map[linkId] = { 예약건수: 0, 거래액: 0, 커미션: 0 };
    map[linkId].예약건수++;
    map[linkId].거래액 += Number(r.SALES_KRW_PRICE) || 0;
    map[linkId].커미션 += Number(r.partnership_commission) || 0;
  });

  const header = [['마이링크ID', '예약건수', '거래액', '정산예정금액']];
  const dataRows = Object.entries(map)
    .sort((a, b) => b[1].예약건수 - a[1].예약건수)
    .map(([id, v]) => [id, v.예약건수, v.거래액, v.커미션]);

  sheet.getRange(1, 1, 1, 4).setValues(header);
  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, 4).setValues(dataRows);
  }
}

function writeHourly(rows) {
  const sheet = getOrCreateSheet('시간별추이');
  sheet.clearContents();

  const header = [['시간', '전체예약건수', '전체거래액', '확정예약건수', '확정거래액']];
  const dataRows = rows
    .filter(r => r.basis_hour)
    .sort((a, b) => new Date(a.basis_hour) - new Date(b.basis_hour))
    .map(r => [
      r.basis_hour,
      r.RESVE || 0,
      r.GMV || 0,
      r.CRESVE || 0,
      r.CGMV || 0,
    ]);

  sheet.getRange(1, 1, 1, 5).setValues(header);
  if (dataRows.length > 0) {
    sheet.getRange(2, 1, dataRows.length, 5).setValues(dataRows);
  }
}

// ============================================================
// 유틸
// ============================================================
function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function formatDate(date) {
  return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd');
}

function nDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
