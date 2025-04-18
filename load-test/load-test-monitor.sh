#!/bin/bash

# Script untuk menjalankan load test dan monitoring secara bersamaan
MEDIUM_IP="GANTI_DENGAN_IP_WORKER_MEDIUM"
NANO_IP="GANTI_DENGAN_IP_WORKER_NANO"

# Buat direktori untuk hasil
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
RESULT_DIR="load_test_results_$TIMESTAMP"
mkdir -p $RESULT_DIR

# Fungsi untuk monitoring metrics dari pod dan menyimpan ke file CSV
monitor_cluster() {
  local duration=$1
  local interval=5  # interval dalam detik
  local iterations=$((duration * 60 / interval))
  local output_file="$RESULT_DIR/metrics_$TIMESTAMP.csv"
  
  echo "Monitoring dimulai, menyimpan data ke $output_file"
  echo "Timestamp,Deployment,Replicas,CPU(%),Memory(Mi)" > $output_file
  
  for ((i=1; i<=iterations; i++)); do
    current_time=$(date +"%Y-%m-%d %H:%M:%S")
    
    # Ambil data deployment medium
    med_pods=$(kubectl get pods -n authentication-app -l app=authentication,node=medium --no-headers | wc -l)
    med_cpu=$(kubectl top pods -n authentication-app -l app=authentication,node=medium --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum}')
    [ -z "$med_cpu" ] && med_cpu=0
    med_mem=$(kubectl top pods -n authentication-app -l app=authentication,node=medium --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum}')
    [ -z "$med_mem" ] && med_mem=0

    # Ambil data deployment nano
    nano_pods=$(kubectl get pods -n authentication-app -l app=authentication,node=nano --no-headers | wc -l)
    nano_cpu=$(kubectl top pods -n authentication-app -l app=authentication,node=nano --no-headers 2>/dev/null | awk '{sum+=$2} END {print sum}')
    [ -z "$nano_cpu" ] && nano_cpu=0
    nano_mem=$(kubectl top pods -n authentication-app -l app=authentication,node=nano --no-headers 2>/dev/null | awk '{sum+=$3} END {print sum}')
    [ -z "$nano_mem" ] && nano_mem=0

    # Log data
    echo "$current_time,authentication-medium,$med_pods,$med_cpu,$med_mem" >> $output_file
    echo "$current_time,authentication-nano,$nano_pods,$nano_cpu,$nano_mem" >> $output_file

    # Print status
    if [ $((i % 12)) -eq 0 ]; then
      echo "Monitoring berjalan: $((i * interval / 60)) menit dari $duration menit"
    fi

    sleep $interval
  done

  echo "Monitoring selesai. Data disimpan ke $output_file"
}

# Fungsi untuk menjalankan k6 load test
run_load_test() {
  # Buat script load test untuk medium
  cat > $RESULT_DIR/load-test-medium.js << EOF
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
  const response = http.get('http://${MEDIUM_IP}:30001/health');

  check(response, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(1);
}
EOF

  # Buat script load test untuk nano
  cat > $RESULT_DIR/load-test-nano.js << EOF
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '2m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
  },
};

export default function () {
  const response = http.get('http://${NANO_IP}:30002/health');

  check(response, {
    'is status 200': (r) => r.status === 200,
  });

  sleep(1);
}
EOF

  echo "Menjalankan load test pada Medium Worker..."
  k6 run $RESULT_DIR/load-test-medium.js --summary-export=$RESULT_DIR/k6-medium-summary.json

  echo "Menunggu 30 detik sebelum menjalankan test kedua..."
  sleep 30

  echo "Menjalankan load test pada Nano Worker..."
  k6 run $RESULT_DIR/load-test-nano.js --summary-export=$RESULT_DIR/k6-nano-summary.json
}

# Fungsi untuk menganalisis hasil dan membuat ringkasan
analyze_results() {
  echo "Menganalisis hasil..."

  # Ringkasan jumlah pod
  echo "Statistik Jumlah Replicas:" > $RESULT_DIR/summary.txt
  echo "Medium Deployment:" >> $RESULT_DIR/summary.txt
  grep "authentication-medium" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $3}' | sort -n | uniq -c | sort -nrk2 >> $RESULT_DIR/summary.txt
  echo "" >> $RESULT_DIR/summary.txt
  echo "Nano Deployment:" >> $RESULT_DIR/summary.txt
  grep "authentication-nano" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $3}' | sort -n | uniq -c | sort -nrk2 >> $RESULT_DIR/summary.txt

  # Max CPU dan Memory
  echo "" >> $RESULT_DIR/summary.txt
  echo "Penggunaan CPU maksimum:" >> $RESULT_DIR/summary.txt
  echo "Medium: $(grep "authentication-medium" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $4}' | sort -n | tail -1)%" >> $RESULT_DIR/summary.txt
  echo "Nano: $(grep "authentication-nano" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $4}' | sort -n | tail -1)%" >> $RESULT_DIR/summary.txt

  echo "" >> $RESULT_DIR/summary.txt
  echo "Penggunaan Memory maksimum:" >> $RESULT_DIR/summary.txt
  echo "Medium: $(grep "authentication-medium" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $5}' | sort -n | tail -1) Mi" >> $RESULT_DIR/summary.txt
  echo "Nano: $(grep "authentication-nano" $RESULT_DIR/metrics_$TIMESTAMP.csv | awk -F',' '{print $5}' | sort -n | tail -1) Mi" >> $RESULT_DIR/summary.txt

  # Print ringkasan
  echo ""
  echo "========== RINGKASAN HASIL =========="
  cat $RESULT_DIR/summary.txt
  echo "===================================="
  echo "Semua data tersimpan di direktori: $RESULT_DIR"
}

# Konfirmasi alamat IP
echo "Script akan menggunakan alamat IP berikut untuk load testing:"
echo "Medium Worker: $MEDIUM_IP:30001"
echo "Nano Worker: $NANO_IP:30002"
read -p "Apakah IP sudah benar? (y/n): " confirm
if [[ $confirm != "y" ]]; then
  read -p "Masukkan IP untuk Medium Worker: " MEDIUM_IP
  read -p "Masukkan IP untuk Nano Worker: " NANO_IP
fi

# Konfirmasi konfigurasi test
echo "Load test akan berjalan dengan konfigurasi:"
echo "Medium: 1m ramp-up ke 10 users -> 3m sustain 50 users -> 1m ramp-down"
echo "Nano: 1m ramp-up ke 5 users -> 2m sustain 20 users -> 1m ramp-down"
echo "Total durasi monitoring: ~10 menit"
read -p "Lanjutkan? (y/n): " confirm
if [[ $confirm != "y" ]]; then
  echo "Test dibatalkan"
  exit 0
fi

# Jalankan monitoring di background
monitor_cluster 10 &
MONITOR_PID=$!

# Jalankan load test
run_load_test

# Tunggu monitoring selesai
wait $MONITOR_PID

# Analisis hasil
analyze_results

echo "Test dan monitoring selesai!"