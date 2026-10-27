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

async function runNewFeatureTests() {
  console.log('========================================================');
  console.log('🧪 TEST CHI TIẾT TẤT CẢ CÁC TÍNH NĂNG MỚI ĐƯỢC YÊU CẦU');
  console.log('========================================================\n');

  try {
    // 1. Login guest
    console.log('[1] Đăng nhập tài khoản...');
    const guest = await apiCall('POST', '/api/auth/guest');
    const token = guest.body.data?.token;
    const authHeaders = { Authorization: `Bearer ${token}` };
    console.log('    ✅ Đăng nhập thành công!');

    // 2. Tạo dự án mới
    console.log('\n[2] Tạo Dự án kiểm thử tính năng mới...');
    const projRes = await apiCall(
      'POST',
      '/api/projects',
      {
        title: 'Võ Lâm Kỳ Duyên Test',
        genre: 'Kiếm Hiệp Cổ Điển',
        description: 'Dự án test các form node mới, chương và sự kiện',
      },
      authHeaders
    );
    const projectId = projRes.body.data.id;
    console.log(`    ✅ Đã tạo Dự án ID: ${projectId}`);

    // 3. Test Tạo chương (Tạo chương & Tên chương)
    console.log('\n[3] Test Tạo Chương truyện mới (POST /api/projects/:id/chapters)...');
    const ch1Res = await apiCall(
      'POST',
      `/api/projects/${projectId}/chapters`,
      {
        chapterNumber: 1,
        title: 'Hồi 1: Phong Vân Tái Khởi',
        desc: 'Mở đầu cuộc phân tranh giang hồ',
      },
      authHeaders
    );
    if (ch1Res.status !== 201) {
      throw new Error(`Tạo chương 1 thất bại! Status: ${ch1Res.status}, Msg: ${ch1Res.body.message}`);
    }
    const ch1 = ch1Res.body.data;
    console.log(`    ✅ Đã tạo Chương 1: ID=${ch1.id}, Số=${ch1.chapterNumber}, Tiêu đề="${ch1.title}"`);

    const ch2Res = await apiCall(
      'POST',
      `/api/projects/${projectId}/chapters`,
      {
        chapterNumber: 2,
        title: 'Hồi 2: Huyết Chiến Ma Đầu',
        desc: 'Trận đánh sinh tử tại hắc thạch lĩnh',
      },
      authHeaders
    );
    const ch2 = ch2Res.body.data;
    console.log(`    ✅ Đã tạo Chương 2: ID=${ch2.id}, Số=${ch2.chapterNumber}, Tiêu đề="${ch2.title}"`);

    // 4. Test Lấy Chapters trong getProjectGraph
    console.log('\n[4] Test getProjectGraph trả về danh sách chapters...');
    const graphRes = await apiCall('GET', `/api/projects/${projectId}/graph`, null, authHeaders);
    const graphData = graphRes.body.data;
    if (!graphData.chapters || graphData.chapters.length !== 2) {
      throw new Error(`Graph không chứa đúng 2 chapters! Có ${graphData.chapters?.length}`);
    }
    console.log(`    ✅ getProjectGraph đã trả về ${graphData.chapters.length} chapters chính xác!`);

    // 5. Test Auto Unique ID trên Node (Không truyền id, Backend tự sinh)
    console.log('\n[5] Test Auto Unique ID (Không truyền ID, Backend tự sinh unique)...');
    const autoNodeRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Tiêu Dao Tử',
        type: 'character',
        desc: 'Cao nhân ẩn thế',
      },
      authHeaders
    );
    const autoNode = autoNodeRes.body.data;
    if (!autoNode.id || !autoNode.id.startsWith('char-')) {
      throw new Error(`Backend không tự sinh ID chuẩn cho Node: ${autoNode.id}`);
    }
    console.log(`    ✅ Backend tự sinh Unique ID thành công: "${autoNode.id}" cho Node "${autoNode.name}"`);

    // 6. Test Tạo Node Sự Kiện (Event) với Chương và Nơi diễn ra (Bỏ impact)
    console.log('\n[6] Test Tạo Node Sự kiện (Chương dropdown, Nơi diễn ra dropdown, không impact)...');
    const eventRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Đại Họa Diệt Môn',
        type: 'event',
        chapter: ch1.title,
        location: 'Hàn Nguyệt Thành',
        desc: 'Một đêm phong ba tàn sát toàn gia',
      },
      authHeaders
    );
    const eventNode = eventRes.body.data;
    if (eventNode.chapter !== ch1.title || eventNode.location !== 'Hàn Nguyệt Thành') {
      throw new Error('Node Sự kiện không lưu đúng Chương hoặc Nơi diễn ra!');
    }
    console.log(`    ✅ Node Sự kiện: ID=${eventNode.id}, Chương="${eventNode.chapter}", Nơi diễn ra="${eventNode.location}"`);

    // 7. Test Tạo Node Nhân Vật với Trạng thái "Đã chết" / "Hồi sinh" kèm sự kiện (statusEvent)
    console.log('\n[7] Test Node Nhân vật với trạng thái "Đã chết" + sự kiện gây tử vong (statusEvent)...');
    const charDeceasedRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Liễu Thiên Hành',
        type: 'character',
        status: 'Đã chết',
        statusEvent: eventNode.name,
        gender: 'Nam',
        dob: '15/08/960',
        birthplace: 'Hàn Nguyệt Thành',
        weapon: 'Tàn Hồng Kiếm',
      },
      authHeaders
    );
    const charDeceased = charDeceasedRes.body.data;
    if (charDeceased.status !== 'Đã chết' || charDeceased.statusEvent !== eventNode.name) {
      throw new Error('Node Nhân vật không lưu đúng status "Đã chết" hoặc statusEvent!');
    }
    console.log(`    ✅ Nhân vật: ${charDeceased.name} | Trạng thái: ${charDeceased.status} | Sự kiện tử nạn: ${charDeceased.statusEvent}`);

    // 8. Test Tạo Node Vật Phẩm: Không vai trò/phân loại/uy lực; Độ hiếm, Nguồn gốc, Người giữ
    console.log('\n[8] Test Node Vật phẩm (Bỏ vai trò, phân loại, uy lực; Có độ hiếm, nguồn gốc, người giữ)...');
    const itemRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Bạch Hổ Ngọc Bội',
        type: 'item',
        rarity: 'Truyền thuyết',
        origin: 'Hàn Nguyệt Thành',
        holderOrLocation: 'Liễu Thiên Hành',
        desc: 'Miếng ngọc tỏa linh khí hộ thể',
      },
      authHeaders
    );
    const itemNode = itemRes.body.data;
    if (itemNode.rarity !== 'Truyền thuyết' || itemNode.origin !== 'Hàn Nguyệt Thành' || itemNode.holderOrLocation !== 'Liễu Thiên Hành') {
      throw new Error('Node Vật phẩm không lưu đúng độ hiếm, nguồn gốc hoặc người giữ!');
    }
    console.log(`    ✅ Vật phẩm: ${itemNode.name} | Độ hiếm: ${itemNode.rarity} | Nguồn gốc: ${itemNode.origin} | Người giữ: ${itemNode.holderOrLocation}`);

    // 9. Test Tạo Node Địa Điểm: Bỏ vai trò, phân loại, trạng thái, địa thế; Các thông tin địa danh (khu vực, mức nguy hiểm, khí hậu, thế lực)
    console.log('\n[9] Test Node Địa điểm (Khu vực, Mức nguy hiểm, Khí hậu, Thế lực cai quản)...');
    const locRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Hắc Phong Nhai',
        type: 'location',
        region: 'Bắc Hoang',
        dangerLevel: 'Cực kỳ nguy hiểm',
        climate: 'Băng giá hàn lãnh',
        ruler: 'Thiên Ma Giáo',
        desc: 'Vách đá cao ngàn trượng bốn mùa tuyết phủ',
      },
      authHeaders
    );
    const locNode = locRes.body.data;
    if (locNode.region !== 'Bắc Hoang' || locNode.dangerLevel !== 'Cực kỳ nguy hiểm' || locNode.climate !== 'Băng giá hàn lãnh' || locNode.ruler !== 'Thiên Ma Giáo') {
      throw new Error('Node Địa điểm không lưu đúng các trường dropdown!');
    }
    console.log(`    ✅ Địa điểm: ${locNode.name} | Khu vực: ${locNode.region} | Nguy hiểm: ${locNode.dangerLevel} | Khí hậu: ${locNode.climate} | Cai quản: ${locNode.ruler}`);

    // 10. Test Tạo Node Phe Phái: Phân loại chính/tà, Trạng thái suy tàn kèm sự kiện, Minh chủ, Căn cứ
    console.log('\n[10] Test Node Phe phái (Phân loại chính/tà, Suy tàn kèm sự kiện, Minh chủ, Căn cứ)...');
    const facRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Thần Kiếm Môn',
        type: 'faction',
        subType: 'Chính phái',
        status: 'Suy tàn',
        statusEvent: eventNode.name,
        leader: 'Liễu Thiên Hành',
        headquarters: 'Hàn Nguyệt Thành',
        motto: 'Chính khí trường tồn',
      },
      authHeaders
    );
    const facNode = facRes.body.data;
    if (facNode.subType !== 'Chính phái' || facNode.status !== 'Suy tàn' || facNode.statusEvent !== eventNode.name || facNode.leader !== 'Liễu Thiên Hành' || facNode.headquarters !== 'Hàn Nguyệt Thành') {
      throw new Error('Node Phe phái không lưu đúng các trường mới!');
    }
    console.log(`    ✅ Phe phái: ${facNode.name} | Phân loại: ${facNode.subType} | Trạng thái: ${facNode.status} | Sự kiện suy tàn: ${facNode.statusEvent} | Minh chủ: ${facNode.leader} | Căn cứ: ${facNode.headquarters}`);

    // 11. Test Gán sự kiện vào chương
    console.log('\n[11] Test Gán sự kiện vào chương (Cập nhật events trong chapter)...');
    const updatedCh1Res = await apiCall(
      'PUT',
      `/api/chapters/${ch1.id}`,
      {
        events: [
          {
            id: eventNode.id,
            name: eventNode.name,
            location: eventNode.location,
            desc: eventNode.desc,
            type: 'event',
          },
        ],
      },
      authHeaders
    );
    if (updatedCh1Res.status !== 200) {
      throw new Error('Cập nhật gán sự kiện vào chương thất bại!');
    }
    const updatedCh1 = updatedCh1Res.body.data;
    if (!updatedCh1.events || updatedCh1.events.length !== 1 || updatedCh1.events[0].id !== eventNode.id) {
      throw new Error('Sự kiện chưa được gán vào chương đúng!');
    }
    console.log(`    ✅ Đã gán thành công sự kiện "${eventNode.name}" vào "${updatedCh1.title}"`);

    // 12. Test Tự động kết nối đồ thị (Character -> Item, Character -> Location, Faction -> Event)
    console.log('\n[12] Test Tự động kết nối đồ thị Neo4j khi gán Nhân vật với Vật phẩm và Địa điểm...');
    // Tạo 1 node địa điểm "Hàn Nguyệt Thành" để kết nối
    const hntRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Hàn Nguyệt Thành',
        type: 'location',
        region: 'Đông Vực',
        dangerLevel: 'Tuyệt đối an toàn',
      },
      authHeaders
    );
    const hntNode = hntRes.body.data;

    // Tạo 1 node vật phẩm "Tàn Hồng Kiếm" để kết nối với Liễu Thiên Hành (có weapon = 'Tàn Hồng Kiếm')
    const thkRes = await apiCall(
      'POST',
      `/api/projects/${projectId}/nodes`,
      {
        name: 'Tàn Hồng Kiếm',
        type: 'item',
        rarity: 'Cực phẩm',
        origin: 'Hàn Nguyệt Thành',
        holderOrLocation: 'Liễu Thiên Hành',
      },
      authHeaders
    );
    const thkNode = thkRes.body.data;

    // Kiểm tra getProjectGraph trả về các mối quan hệ (links) tự động trong Neo4j
    const graphWithLinks = await apiCall('GET', `/api/projects/${projectId}/graph`, null, authHeaders);
    const linksFound = graphWithLinks.body.data?.links || [];
    console.log(`    Đồ thị hiện có: ${graphWithLinks.body.data?.nodes?.length} nodes và ${linksFound.length} links`);
    if (linksFound.length === 0) {
      throw new Error('Neo4j chưa nhận liên kết giữa các node!');
    }
    for (const l of linksFound) {
      console.log(`    🔗 Link: [${l.source}] --(${l.label || l.category})--> [${l.target}]`);
    }
    console.log('    ✅ Neo4j ĐÃ TỰ ĐỘNG KẾT NỐI CÁC NODE VỚI NHAU THÀNH ĐỒ THỊ HOÀN CHỈNH!');

    // 13. Test Tạo và Xóa Link thủ công (POST /api/links & DELETE /api/links/:id)
    console.log('\n[13] Test API Link thủ công (POST & DELETE /api/links)...');
    const manualLinkRes = await apiCall(
      'POST',
      '/api/links',
      {
        projectId,
        source: autoNode.id,
        target: hntNode.id,
        label: 'Du ngoạn tới',
        type: 'solid',
      },
      authHeaders
    );
    if (manualLinkRes.status !== 201) {
      throw new Error('Tạo link thủ công qua API thất bại!');
    }
    const manualLink = manualLinkRes.body.data;
    console.log(`    ✅ Đã tạo Link thủ công ID=${manualLink.id}: "${manualLink.label}"`);

    const delLinkRes = await apiCall('DELETE', `/api/links/${manualLink.id}`, null, authHeaders);
    if (delLinkRes.status !== 200) {
      throw new Error('Xóa link qua API thất bại!');
    }
    console.log('    ✅ Đã xóa Link thủ công thành công!');

    // 14. Dọn dẹp dữ liệu test
    console.log('\n[14] Dọn dẹp Dự án test trên Neo4j...');
    await apiCall('DELETE', `/api/projects/${projectId}`, null, authHeaders);
    console.log('    ✅ Đã xóa dự án test thành công.');

    console.log('\n========================================================');
    console.log('🎉 TẤT CẢ CÁC BƯỚC KIỂM THỬ TÍNH NĂNG & LIÊN KẾT ĐỀU HOÀN TOÀN THÀNH CÔNG!');
    console.log('========================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST THẤT BẠI:', err.message);
    process.exit(1);
  }
}

runNewFeatureTests();
