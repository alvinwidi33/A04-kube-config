cat > load-test-medium.js << EOF
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get('http://<WORKER_MEDIUM_PUBLIC_IP>:30001/health');
  
  check(response, {
    'is status 200': (r) => r.status === 200,
  });
  
  sleep(1);
}
EOF
