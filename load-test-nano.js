import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 5 },   // Ramp-up to 5 users over 1 minute
    { duration: '2m', target: 20 },  // Ramp-up to 20 users over 2 minutes
    { duration: '1m', target: 0 },   // Ramp-down to 0 users over 1 minute
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests should be below 500ms
  },
};

export default function () {
  // Replace with actual API endpoint
  const response = http.get('http://<WORKER_NANO_PUBLIC_IP>:30002/health');
  
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
