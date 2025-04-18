import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 30 },  // Ramp-up ke 30 users dalam 1 menit
    { duration: '3m', target: 100 }, // Pertahankan 100 users selama 3 menit
    { duration: '1m', target: 0 },   // Ramp-down ke 0 dalam 1 menit
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get('http://3.80.47.223:30002/health');
  
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
