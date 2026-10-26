const request = require('http');

const BASE_URL = 'http://localhost:5000';

function apiCall(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = request.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runE2E() {
  console.log('====================================================');
  console.log('🚀 KIỂM THỬ E2E TOÀN BỘ CHỨC NĂNG DỰ ÁN VÀ NODE');
  console.log('====================================================\n');

  try {
    // 1. Health check
    const health = await apiCall('GET', '/api/health');
    console.log(`[1] Backend & Neo4j Health: Status ${health.status}, DB: ${health.body.neo4j?.status}`);
    if (health.body.neo4j?.status !== 'connected') {
      throw new Error('Neo4j Aura không kết nối được!');
    }

    // 2. Guest Login
    console.log('\n[2] Đăng nhập Khách (Guest)...');
    const guest = await apiCall('POST', '/api/auth/guest');
    const token = guest.body.data?.token;
    const user = guest.body.data?.user;
    console.log(`    Đăng nhập thành công: ${user?.penName} (${user?.id})`);
    const authHeaders = { Authorization: `Bearer ${token}` };

    // 3. Lấy danh sách dự án ban đầu
    console.log('\n[3] Lấy danh sách dự án hiện tại...');
    const listBefore = await apiCall('GET', '/api/projects', null, authHeaders);
    console.log(`    Tổng số dự án hiện có: ${listBefore.body.count || 0}`);

    // 4. Tạo dự án mới 1: "Thiên Ma Truyền Kỳ"
    console.log('\n[4] Tạo Dự án 1: "Thiên Ma Truyền Kỳ"...');
    const proj1Res = await apiCall(
      'POST',
      '/api/projects',
      {
        title: 'Thiên Ma Truyền Kỳ',
        genre: 'Tiên Hiệp Hắc Ám',
        description: 'Câu chuyện về ma đạo quật khởi',
      },
      authHeaders
    );
    const p1 = proj1Res.body.data;
    console.log(`    Tạo thành công Dự án 1! ID: ${p1.id}, Title: "${p1.title}"`);

    // 5. Tạo dự án mới 2: "Ngân Hà Chiến Kỷ"
    console.log('\n[5] Tạo Dự án 2: "Ngân Hà Chiến Kỷ"...');
    const proj2Res = await apiCall(
      'POST',
      '/api/projects',
      {
        title: 'Ngân Hà Chiến Kỷ',
        genre: 'Khoa Huyễn Vũ Trụ',
        description: 'Chiến tranh giữa các thiên hà',
      },
      authHeaders
    );
    const p2 = proj2Res.body.data;
    console.log(`    Tạo thành công Dự án 2! ID: ${p2.id}, Title: "${p2.title}"`);

    // 6. KIỂM TRA QUAN TRỌNG: Kiểm tra Dự án 1 và 2 có bị hiển thị node của dự án khác không
    console.log('\n[6] KIỂM TRA BIỆT LẬP KHI MỚI TẠO (Bug fix verify)...');
    const graph1 = await apiCall('GET', `/api/projects/${p1.id}/graph`, null, authHeaders);
    const graph2 = await apiCall('GET', `/api/projects/${p2.id}/graph`, null, authHeaders);
    console.log(`    Dự án 1 (Thiên Ma Truyền Kỳ) nodes: ${graph1.body.data?.nodes?.length || 0}`);
    console.log(`    Dự án 2 (Ngân Hà Chiến Kỷ) nodes: ${graph2.body.data?.nodes?.length || 0}`);
    if (graph1.body.data?.nodes?.length !== 0 || graph2.body.data?.nodes?.length !== 0) {
      throw new Error('❌ LỖI: Dự án mới tạo bị dính node của dự án khác!');
    }
    console.log('    ✅ CHÍNH XÁC: Cả 2 dự án mới đều sạch sẽ (0 nodes), không bị rò rỉ!');

    // 7. Tạo Node NHÂN VẬT (Character) với đầy đủ trường đặc thù
    console.log('\n[7] Thêm Nhân vật (Character) vào Dự án 1...');
    const charPayload = {
      name: 'Mặc Vô Thường',
      type: 'character',
      role: 'Ma Tôn',
      desc: 'Người thống lĩnh Thập Vạn Đại Sơn',
      status: 'active',
      dob: '07/07/888',
      gender: 'Nam',
      weapon: 'Huyết Sát U Hồn Đao',
      sect: 'U Ma Điện',
      personality: 'Bá đạo, quyết đoán',
      x: 150,
      y: 250,
    };
    const cRes = await apiCall('POST', `/api/projects/${p1.id}/nodes`, charPayload, authHeaders);
    const cNode = cRes.body.data;
    console.log(`    ID: ${cNode.id} | Tên: ${cNode.name} | Ngày sinh: ${cNode.dob} | Giới tính: ${cNode.gender} | Vũ khí: ${cNode.weapon} | Môn phái: ${cNode.sect} | Trạng thái: ${cNode.status}`);

    // 8. Tạo Node VẬT PHẨM (Item) với đầy đủ trường đặc thù
    console.log('\n[8] Thêm Vật phẩm (Item) vào Dự án 1...');
    const itemPayload = {
      name: 'Hồn Thiên Châu',
      type: 'item',
      role: 'Thánh vật ma đạo',
      desc: 'Chứa đựng oán khí vạn năm',
      status: 'intact',
      rarity: 'Cực Phẩm Ma Khí',
      origin: 'Cửu U Hoàng Tuyền',
      element: 'Ám Hắc',
      power: 'Thôn phệ thần hồn đối thủ',
      holderOrLocation: 'Mặc Vô Thường',
      x: 350,
      y: 250,
    };
    const iRes = await apiCall('POST', `/api/projects/${p1.id}/nodes`, itemPayload, authHeaders);
    const iNode = iRes.body.data;
    console.log(`    ID: ${iNode.id} | Tên: ${iNode.name} | Phẩm cấp: ${iNode.rarity} | Xuất xứ: ${iNode.origin} | Thuộc tính: ${iNode.element} | Uy lực: ${iNode.power} | Trạng thái: ${iNode.status}`);

    // 9. Tạo Node ĐỊA ĐIỂM (Location) với đầy đủ trường đặc thù
    console.log('\n[9] Thêm Địa điểm (Location) vào Dự án 1...');
    const locPayload = {
      name: 'Vạn Cốt Quỷ Cốc',
      type: 'location',
      role: 'Cấm địa sinh tử',
      desc: 'Nơi chôn vùi hàng triệu tu sĩ thượng cổ',
      status: 'accessible',
      region: 'U Ám Hoang Nguyên',
      climate: 'Mưa axit độc quanh năm',
      terrain: 'Hẻm núi vực thẳm',
      dangerLevel: 'Tuyệt địa diệt vong',
      ruler: 'Bạch Cốt Tướng Quân',
      x: 200,
      y: 450,
    };
    const lRes = await apiCall('POST', `/api/projects/${p1.id}/nodes`, locPayload, authHeaders);
    const lNode = lRes.body.data;
    console.log(`    ID: ${lNode.id} | Tên: ${lNode.name} | Khu vực: ${lNode.region} | Khí hậu: ${lNode.climate} | Địa hình: ${lNode.terrain} | Mức nguy hiểm: ${lNode.dangerLevel} | Cai quản: ${lNode.ruler}`);

    // 10. Tạo Node MÔN PHÁI (Faction) với trường đặc thù
    console.log('\n[10] Thêm Môn phái (Faction) vào Dự án 1...');
    const facPayload = {
      name: 'Cửu U Ma Tông',
      type: 'faction',
      leader: 'Mặc Vô Thường',
      headquarters: 'Hắc Long Đỉnh',
      motto: 'Thuận ta thì sống, nghịch ta thì chết',
      alignment: 'Tà phái',
      influence: 'Bá chủ Tây Lăng',
      status: 'thriving',
      x: 400,
      y: 450,
    };
    const fRes = await apiCall('POST', `/api/projects/${p1.id}/nodes`, facPayload, authHeaders);
    const fNode = fRes.body.data;
    console.log(`    ID: ${fNode.id} | Tên: ${fNode.name} | Chưởng môn: ${fNode.leader} | Trụ sở: ${fNode.headquarters} | Khẩu hiệu: ${fNode.motto} | Xu hướng: ${fNode.alignment}`);

    // 11. Tạo Node BIẾN CỐ (Event) với trường đặc thù
    console.log('\n[11] Thêm Biến cố (Event) vào Dự án 1...');
    const eventPayload = {
      name: 'Đại Chiến Chính Ma Lần Thứ Ba',
      type: 'event',
      time: 'Năm Thiên Nguyên 1024',
      location: 'Thiên Huyết Bình Nguyên',
      chapter: 'Chương 50 - 65',
      impact: 'Chia đôi đại lục, 10 vạn người ngã xuống',
      status: 'completed',
      x: 280,
      y: 600,
    };
    const eRes = await apiCall('POST', `/api/projects/${p1.id}/nodes`, eventPayload, authHeaders);
    const eNode = eRes.body.data;
    console.log(`    ID: ${eNode.id} | Tên: ${eNode.name} | Thời gian: ${eNode.time} | Địa điểm: ${eNode.location} | Chương: ${eNode.chapter} | Tác động: ${eNode.impact}`);

    // 12. TẠO LIÊN KẾT (Link) giữa Nhân vật và Vật phẩm
    console.log('\n[12] Tạo Liên kết (Link): Mặc Vô Thường SỞ HỮU Hồn Thiên Châu...');
    const linkRes = await apiCall(
      'POST',
      '/api/links',
      {
        projectId: p1.id,
        source: cNode.id,
        target: iNode.id,
        label: 'Sở hữu & Luyện hóa',
        type: 'OWNS',
      },
      authHeaders
    );
    console.log(`    Tạo liên kết status: ${linkRes.status}, label: "${linkRes.body.data?.label}"`);

    // 13. KIỂM TRA ĐỐI CHIẾU BIỆT LẬP: Dự án 1 có 5 nodes & 1 link, Dự án 2 vẫn 0 nodes!
    console.log('\n[13] KIỂM TRA ĐỐI CHIẾU ĐỒ THỊ 2 DỰ ÁN...');
    const graph1After = await apiCall('GET', `/api/projects/${p1.id}/graph`, null, authHeaders);
    const graph2After = await apiCall('GET', `/api/projects/${p2.id}/graph`, null, authHeaders);

    console.log(`    Dự án 1: ${graph1After.body.data?.nodes?.length} nodes, ${graph1After.body.data?.links?.length} links`);
    console.log(`    Dự án 2: ${graph2After.body.data?.nodes?.length} nodes, ${graph2After.body.data?.links?.length} links`);

    if (graph1After.body.data?.nodes?.length !== 5 || graph2After.body.data?.nodes?.length !== 0) {
      throw new Error('❌ LỖI: Rò rỉ node giữa các dự án!');
    }
    console.log('    ✅ TUYỆT ĐỐI BIỆT LẬP: Dự án 1 đầy đủ 5 nodes, Dự án 2 hoàn toàn sạch!');

    // 14. SỬA NODE (Update Node)
    console.log('\n[14] Kiểm tra SỬA NODE (Update Character)...');
    const updateRes = await apiCall(
      'PUT',
      `/api/nodes/${cNode.id}`,
      {
        name: 'Mặc Vô Thường (Đại Thừa Cảnh)',
        weapon: 'Huyết Sát U Hồn Đao (Cửu Khiếu Hoàn Mỹ)',
        status: 'deceased',
        personality: 'Trầm mặc, vô tình',
      },
      authHeaders
    );
    const updatedC = updateRes.body.data;
    console.log(`    Tên mới: ${updatedC.name}`);
    console.log(`    Vũ khí mới: ${updatedC.weapon}`);
    console.log(`    Trạng thái mới: ${updatedC.status}`);
    console.log(`    Bảo toàn ngày sinh: ${updatedC.dob} (vẫn giữ nguyên 07/07/888)`);

    if (updatedC.name !== 'Mặc Vô Thường (Đại Thừa Cảnh)' || updatedC.dob !== '07/07/888') {
      throw new Error('Lỗi cập nhật node!');
    }
    console.log('    ✅ CẬP NHẬT THÀNH CÔNG!');

    // 15. XÓA NODE VÀ LIÊN KẾT (Delete Node)
    console.log('\n[15] Kiểm tra XÓA NODE VÀ TỰ ĐỘNG DỌN LIÊN KẾT (Delete Character)...');
    const delRes = await apiCall('DELETE', `/api/nodes/${cNode.id}`, null, authHeaders);
    console.log(`    Delete node status: ${delRes.status}`);

    const graph1AfterDel = await apiCall('GET', `/api/projects/${p1.id}/graph`, null, authHeaders);
    console.log(`    Dự án 1 sau khi xóa Nhân vật: ${graph1AfterDel.body.data?.nodes?.length} nodes (trước đó 5), ${graph1AfterDel.body.data?.links?.length} links (trước đó 1)`);

    const hasDeletedNode = graph1AfterDel.body.data?.nodes?.some((n) => n.id === cNode.id);
    if (hasDeletedNode || graph1AfterDel.body.data?.nodes?.length !== 4 || graph1AfterDel.body.data?.links?.length !== 0) {
      throw new Error('Lỗi xóa node hoặc liên kết chưa được dọn dẹp!');
    }
    console.log('    ✅ XÓA VÀ DỌN DẸP LIÊN KẾT THÀNH CÔNG!');

    // 16. DỌN DẸP DỰ ÁN TEST
    console.log('\n[16] Dọn dẹp Dự án 1 và Dự án 2...');
    await apiCall('DELETE', `/api/projects/${p1.id}`, null, authHeaders);
    await apiCall('DELETE', `/api/projects/${p2.id}`, null, authHeaders);
    console.log('    Đã xóa xong các dự án test trên Neo4j.');

    console.log('\n====================================================');
    console.log('🏆 TOÀN BỘ CÁC CHỨC NĂNG ĐÃ TEST VÀ HOẠT ĐỘNG HOÀN HẢO 100%!');
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runE2E();
