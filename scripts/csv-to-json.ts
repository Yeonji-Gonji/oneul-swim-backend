/**
 * 공공데이터포털 "전국공공체육시설표준데이터" CSV → import-public.ts 입력 JSON 변환기.
 *
 *   npx tsx scripts/csv-to-json.ts <input.csv> [output.json]
 *   (output 생략 시 stdout)
 *
 * CSV 컬럼명은 데이터셋 버전마다 조금씩 달라, 헤더 키워드로 유연 매핑한다.
 * 인코딩: 공공데이터 CSV 는 보통 EUC-KR/CP949 → UTF-8 로 먼저 변환해 넘길 것
 *   (예: `iconv -f CP949 -t UTF-8 원본.csv > input.csv`).
 * 변환 결과는 scripts/import-public.ts 가 그대로 먹는 RawFacility[] 형태.
 */
import { readFileSync, writeFileSync } from 'node:fs';

/** 따옴표/줄바꿈을 처리하는 최소 CSV 파서 (RFC4180 근사) */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const src = text.replace(/^﻿/, ''); // BOM 제거
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows;
}

/** 헤더 배열에서 키워드를 포함하는 첫 컬럼 인덱스 */
function col(headers: string[], ...keywords: string[]): number {
  return headers.findIndex((h) => keywords.some((k) => h.includes(k)));
}

function main() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input) {
    console.error('사용법: npx tsx scripts/csv-to-json.ts <input.csv> [output.json]');
    process.exit(1);
  }
  const rows = parseCsv(readFileSync(input, 'utf-8'));
  if (rows.length < 2) {
    console.error('데이터 행이 없습니다.');
    process.exit(1);
  }
  const headers = rows[0].map((h) => h.trim());

  const idx = {
    code: col(headers, '시설코드', '관리번호', '시설관리번호'),
    name: col(headers, '시설명', '체육시설명'),
    facilityType: col(headers, '시설유형', '체육시설구분', '종목'),
    roadAddress: col(headers, '도로명주소', '소재지도로명'),
    jibunAddress: col(headers, '지번주소', '소재지지번'),
    lat: col(headers, '위도'),
    lng: col(headers, '경도'),
    phone: col(headers, '전화', '연락처'),
    operator: col(headers, '관리기관', '운영기관', '관리주체'),
    websiteUrl: col(headers, '홈페이지', 'url', 'URL'),
  };

  const pick = (r: string[], i: number) => (i >= 0 ? r[i]?.trim() ?? '' : '');
  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && v !== '' ? n : null;
  };

  const out = rows.slice(1).map((r) => ({
    code: pick(r, idx.code) || undefined,
    name: pick(r, idx.name),
    facilityType: pick(r, idx.facilityType),
    roadAddress: pick(r, idx.roadAddress),
    jibunAddress: pick(r, idx.jibunAddress),
    lat: num(pick(r, idx.lat)),
    lng: num(pick(r, idx.lng)),
    phone: pick(r, idx.phone) || null,
    operator: pick(r, idx.operator) || null,
    websiteUrl: pick(r, idx.websiteUrl) || null,
  }));

  const json = JSON.stringify(out, null, 2);
  if (output) {
    writeFileSync(output, json + '\n');
    console.error(`${out.length}행 변환 → ${output}`);
  } else {
    process.stdout.write(json + '\n');
  }
}

main();
