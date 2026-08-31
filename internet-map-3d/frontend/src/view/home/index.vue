<script setup lang="ts">
import mapImg from '@/assets/img/map.png'
import worldMapImg from '@/assets/img/worldMap.png'
import dashboardImg from '@/assets/img/dashboard.png'
import pluginImg from '@/assets/img/plugin.png'

</script>

<template>
  <el-row>
    <el-col>
      <section class="jumbotron text-center">
        <div class="container">
          <h1>INTERNET MAP 3D</h1>
          <p class="lead text-muted">This is a work-in-progress prototype of the internet-map..</p>
        </div>
      </section>
    </el-col>
  </el-row>
  <el-row class="menu" style="padding: 20px 0" :justify="'center'">
    <el-col :span="22">
      <ul style="
        display: grid;grid-template-columns: repeat(3, 1fr);
        gap: 20px;
        list-style: none;
        padding: 0;
        margin: 0;"
      >
        <li>
          <router-link
              :to="{ name: 'liveEmulatorTopology3D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Live 3D emulator topology loaded from Docker API data, with live packet capture and replay controls."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>LIVE EMULATOR TOPOLOGY</h3>
                </template>
                <el-image :src="worldMapImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'emulatorTopology3D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="File-based 3D emulator topology loaded from an uploaded Docker Compose file, with saved packet replay support."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>EMULATOR TOPOLOGY</h3>
                </template>
                <el-image :src="mapImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'emulatorTopology2D'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="File-based emulator topology loaded from an uploaded Docker Compose file and rendered as a Cesium 2D map."
                placement="bottom-start"
            >
              <el-card>
                <template #header>
                  <h3>EMULATOR TOPOLOGY 2D</h3>
                </template>
                <el-image :src="worldMapImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'dashboard'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="seedemu dashboard, displays current emulator nodes and networks."
                placement="bottom"
            >
              <el-card>
                <template #header>
                  <h3>DASHBOARD</h3>
                </template>
                <el-image :src="dashboardImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
        <li>
          <router-link
              :to="{ name: 'plugin'}"
          >
            <el-tooltip
                class="box-item"
                effect="dark"
                content="Plugin installation page."
                placement="bottom"
            >
              <el-card>
                <template #header>
                  <h3>PLUGIN</h3>
                </template>
                <el-image :src="pluginImg" :fit="'fit'"/>
              </el-card>
            </el-tooltip>
          </router-link>
        </li>
      </ul>
    </el-col>
  </el-row>
</template>

<style scoped lang="scss">
.jumbotron {
  padding: 2rem 1rem;
  margin-bottom: 2rem;
  background-color: #e9ecef;
  border-radius: .3rem;
}

@media (min-width: 576px) {
  .jumbotron {
    padding: 4rem 2rem;
  }
}

.container {
  text-align: center;
}

.menu a {
  text-decoration: none;
}
</style>
